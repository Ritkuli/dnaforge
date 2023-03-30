import * as CANNON from 'cannon-es';
import * as _ from 'lodash';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { randFloat } from 'three/src/math/MathUtils';
import { Cylinder, CylinderModel } from './cylinder_model';

/**
 * A class for relaxing cylinder models via physics simulation.
 */
export class Relaxer {
  world: CANNON.World;
  floor: CANNON.Body;

  springs: CANNON.Spring[] = [];

  cm: CylinderModel;
  cylToMesh = new Map<Cylinder, CANNON.Body>();

  constructor(cm: CylinderModel) {
    this.setupWorld();
    this.setupFloor();
    this.setupFromCM(cm);
  }

  /**
   * Setup the simulation context
   */
  setupWorld() {
    this.world = new CANNON.World();
    const solver = new CANNON.GSSolver();
    solver.iterations = 7;
    solver.tolerance = 0.1;
    this.world.solver = new CANNON.SplitSolver(solver);
    this.world.gravity.set(0, 0, 0);
  }

  /**
   * Setup a static floor
   */
  setupFloor() {
    const groundShape = new CANNON.Box(new CANNON.Vec3(0, 0, 0));
    const floor = new CANNON.Body({ mass: 0, shape: groundShape });
    floor.position.set(0, -10, 0);
    this.floor = floor;
    this.world.addBody(floor);
  }

  /**
   * Sets up the simulation objects from cylinder model. Adds springs between cylinders
   * and connects the cylinders to the floor.
   *
   * @param cm Cylinder Model
   */
  setupFromCM(cm: CylinderModel) {
    this.cm = cm;

    this.createCylinderBodies();
    this.createSpringConstraints();
    this.createFloorConstraints();
  }

  /**
   * Create the cylinder simulation objects.
   */
  createCylinderBodies() {
    for (let i = 0; i < this.cm.cylinders.length; i++) {
      const cyl = this.cm.cylinders[i];
      const scale = cyl.scale;
      const len = cyl.getCylinderLength();
      const transform = cyl.transform
        .clone()
        .scale(new Vector3(1 / scale, 1 / scale, 1 / scale));
      const rot = new Quaternion().setFromRotationMatrix(transform);
      const pos = new Vector3(0, len / 2, 0).applyMatrix4(transform);

      const cylinderShape = new CANNON.Cylinder(scale, scale, len, 10);
      const cylinderBody = new CANNON.Body({ mass: 1, shape: cylinderShape });
      this.world.addBody(cylinderBody);
      cylinderBody.velocity.set(
        randFloat(-0.2, 0.2),
        randFloat(-0.2, 0.2),
        randFloat(-0.2, 0.2)
      );

      this.cylToMesh.set(cyl, cylinderBody);

      cylinderBody.quaternion.copy(rot as unknown as CANNON.Quaternion);
      cylinderBody.position.copy(pos as unknown as CANNON.Vec3);
    }
  }

  /**
   * Create springs between each cylinder from prime to prime.
   */
  createSpringConstraints() {
    for (let cyl of this.cm.cylinders) {
      const body1 = this.cylToMesh.get(cyl);
      const offset1 = new Vector3(
        0,
        -cyl.getCylinderLength() / 2 / cyl.scale,
        0
      );

      for (let prime of _.keys(cyl.neighbours)) {
        const cyl2 = cyl.neighbours[prime][0];

        const body2 = this.cylToMesh.get(cyl2);
        const offset2 = new Vector3(
          0,
          -cyl2.getCylinderLength() / 2 / cyl.scale,
          0
        );

        const pos1 = cyl
          .getPrimePositionU(prime)
          .add(offset1)
          .multiplyScalar(cyl.scale);
        const pos2 = cyl
          .getPairPrimePositionU(prime)
          .add(offset2)
          .multiplyScalar(cyl.scale);

        const options = {
          localAnchorA: pos1 as unknown as CANNON.Vec3,
          localAnchorB: pos2 as unknown as CANNON.Vec3,
          stiffness: 2,
          restLength: 0.05 * cyl.scale,
        };

        const spring = new CANNON.Spring(body1, body2, options);
        this.springs.push(spring);
      }
    }
  }

  /**
   * Create constraints between the cylinders and the floor to
   * keep the cylinders more or less in place.
   */
  createFloorConstraints() {
    const visited = new Set<Cylinder>();

    for (let cyl of this.cm.cylinders) {
      const body1 = this.cylToMesh.get(cyl);
      let cStr = 0.001;
      if (!visited.has(cyl) && cyl.siblings.length < 1) {
        cStr = 2;
        for (let prime of _.keys(cyl.neighbours)) {
          visited.add(cyl.neighbours[prime][0]);
        }
      }

      const floorPos = body1.position.clone().vsub(this.floor.position);
      const constraint = new CANNON.PointToPointConstraint(
        body1,
        new Vector3() as unknown as CANNON.Vec3,
        this.floor,
        floorPos,
        cStr
      );

      this.world.addConstraint(constraint);
    }
  }

  /**
   * Run a simulation step. Updates the simulation objects. Does not update the
   * THREE objects.
   */
  step() {
    this.world.step(1 / 30);

    for (let s of this.springs) s.applyForce();

    for (let i = 0; i < this.cm.cylinders.length; i++) {
      const cyl = this.cm.cylinders[i];
      const mesh = this.cylToMesh.get(cyl);

      const len = cyl.getCylinderLength();
      const scale = new Vector3(cyl.scale, cyl.scale, cyl.scale);
      const rot = new Quaternion().copy(
        mesh.quaternion as unknown as Quaternion
      );
      const pos = new Vector3().copy(mesh.position as unknown as Vector3);
      pos.sub(new Vector3(0, len / 2, 0).applyQuaternion(rot));

      const transform = new Matrix4().compose(pos, rot, scale);
      cyl.transform = transform;
    }
  }
}
