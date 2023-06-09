import * as _ from 'lodash';
import * as THREE from 'three';
import { InstancedMesh, Intersection, Matrix4, Quaternion } from 'three';
import { Vector3 } from 'three';
import { get2PointTransform } from '../utils/misc_utils';
import { DNA, NATYPE, RNA } from '../globals/consts';
import { GLOBALS } from '../globals/globals';
import { Selectable } from '../scene/selection_utils';
import { NucleotideModel } from './nucleotide_model';

export interface NucleotideMeshes {
  bases: InstancedMesh;
  nucleotides: InstancedMesh;
  backbone1: InstancedMesh;
  backbone2: InstancedMesh;
}

const nucleotideColours: Record<string, THREE.Color> = {
  A: new THREE.Color(0x0000ff),
  U: new THREE.Color(0xff0000),
  T: new THREE.Color(0xff0000),
  G: new THREE.Color(0xffff00),
  C: new THREE.Color(0x00ff00),

  W: new THREE.Color(0x0000aa),
  S: new THREE.Color(0x00aa00),
  M: new THREE.Color(0xaa0000),
  K: new THREE.Color(0xaaaa00),
  R: new THREE.Color(0x00aaaa),
  Y: new THREE.Color(0xaaaaaa),

  B: new THREE.Color(0xffaaaa),
  D: new THREE.Color(0xaaffaa),
  H: new THREE.Color(0xaaaaff),
  V: new THREE.Color(0xaacccc),

  N: new THREE.Color(0xffffff),

  nucleotide: new THREE.Color(0xffffff),
  backbone: new THREE.Color(0xffffff),
};

const selectionColours = {
  default: new THREE.Color(0xffffff),
  selection: new THREE.Color(0x5555ff),
  hover: new THREE.Color(0xff5555),
};

const materialNucleotides = new THREE.MeshStandardMaterial({ color: 0xffffff });

const backboneGeometryCone = new THREE.ConeGeometry(0.15, 1, 6);
const backboneGeometryBall = (nucParams: Record<string, any>) => {
  const backbone = new THREE.SphereGeometry(0.15, 16, 8);
  backbone.translate(
    ...(nucParams.BACKBONE_CENTER as [number, number, number]),
  );
  return backbone;
};
const baseGeometry = (nucParams: typeof DNA | typeof RNA) => {
  const base = new THREE.SphereGeometry(0.2, 16, 8);
  base.scale(1, 0.5, 1);
  base.translate(
    ...(nucParams.NUCLEOBASE_CENTER as any as [number, number, number]),
  );
  return base;
};
const nucleotideGeometry = (nucParams: typeof DNA | typeof RNA) => {
  const base = new THREE.CylinderGeometry(0.1, 0.1, 0.75, 8);
  base.applyMatrix4(
    get2PointTransform(nucParams.BACKBONE_CENTER, nucParams.NUCLEOBASE_CENTER),
  );
  return base;
};

/**
 * An individual nucleotide.
 */
export class Nucleotide extends Selectable {
  owner: NucleotideModel;
  id: number;
  instanceMeshes: NucleotideMeshes;

  base: string;
  scale: number;
  naType: NATYPE;
  nucParams: typeof RNA | typeof DNA;

  isLinker = false;
  isScaffold = false;
  isPseudo = false;

  prev: Nucleotide;
  next: Nucleotide;
  pair: Nucleotide;

  transform: Matrix4;
  backboneCenter: Vector3;
  nucleobaseCenter: Vector3;
  hydrogenFaceDir: Vector3;
  baseNormal: Vector3;

  /**
   * Constructs a nucleotide at the origin, along a helical axis pointing towards Y-axis,
   * with the backbone center of mass pointing towards Z-axis.
   *
   * @param nm
   * @param naType DNA | RNA
   * @param base IUPAC code
   */
  constructor(nm: NucleotideModel, base = 'N') {
    super();
    this.owner = nm; // TODO: replace with a strand
    this.base = base;
    this.scale = nm.scale;
    this.naType = nm.naType;
    this.nucParams = nm.nucParams;

    this.setTransform(new Matrix4());
  }

  toJSON(): JSONObject {
    return {
      id: this.id,
      base: this.base,
      scale: this.scale,
      isLinker: this.isLinker,
      isScaffold: this.isScaffold,
      isPseudo: this.isPseudo,
      transform: this.transform.elements,

      prev: this.prev?.id,
      next: this.next?.id,
      pair: this.pair?.id,
    };
  }

  static loadJSON(nm: NucleotideModel, json: any): Nucleotide {
    const n = new Nucleotide(nm, json.base);
    n.id = json.id;
    n.isLinker = json.isLinker;
    n.isScaffold = json.isScaffold;
    n.isPseudo = json.isPseudo;
    n.setTransform(new Matrix4().fromArray(json.transform));
    return n;
  }

  /**
   * Generates instanced meshes of DNA or RNA nucleotides.
   *
   * @param nucParams DNA | RNA
   * @param count number of instances
   * @returns NucleotideMeshes
   */
  static createInstanceMesh(
    nucParams: typeof DNA | typeof RNA,
    count: number,
  ): NucleotideMeshes {
    const meshBases = new THREE.InstancedMesh(
      baseGeometry(nucParams),
      materialNucleotides,
      count,
    );
    const meshNucleotides = new THREE.InstancedMesh(
      nucleotideGeometry(nucParams),
      materialNucleotides,
      count,
    );
    const meshBackbone1 = new THREE.InstancedMesh(
      backboneGeometryCone,
      materialNucleotides,
      count,
    );
    const meshBackbone2 = new THREE.InstancedMesh(
      backboneGeometryBall(nucParams),
      materialNucleotides,
      count,
    );

    const meshes = {
      bases: meshBases,
      nucleotides: meshNucleotides,
      backbone1: meshBackbone1,
      backbone2: meshBackbone2,
    };

    return meshes;
  }

  /**
   * Connects the nucleotide following this one to the one preceding this one and vice versa.
   * Does not delete the nucleotide elsehwere.
   */
  delete() {
    if (this.next) this.next.prev = this.prev;
    if (this.prev) this.prev.next = this.next;
    if (this.pair) this.pair.pair = null;
  }

  /**
   * Sets the backbone center, base normal etc. based onteh current transformation.
   */
  setNucleotideVectors() {
    this.backboneCenter = this.nucParams.BACKBONE_CENTER.clone().applyMatrix4(
      this.transform,
    );
    this.nucleobaseCenter =
      this.nucParams.NUCLEOBASE_CENTER.clone().applyMatrix4(this.transform);
    this.hydrogenFaceDir = this.nucParams.HYDROGEN_FACING_DIR.clone()
      .applyMatrix4(this.transform)
      .sub(new Vector3().applyMatrix4(this.transform))
      .normalize();
    this.baseNormal = this.nucParams.BASE_NORMAL.clone()
      .applyMatrix4(this.transform)
      .sub(new Vector3().applyMatrix4(this.transform))
      .normalize();
  }

  /**
   * Assign the instance meshes and set the instance transformation matrices and colours
   *
   * @param meshes
   */
  setObjectInstance(meshes: NucleotideMeshes) {
    this.instanceMeshes = meshes;
    this.updateObjectMatrices();
    this.updateObjectColours();
    this.updateObjectVisibility();
  }

  /**
   * Set the object instance transformation matrices
   */
  updateObjectMatrices() {
    this.instanceMeshes.bases.setMatrixAt(this.id, this.transform);
    this.instanceMeshes.nucleotides.setMatrixAt(this.id, this.transform);
    let bbTransform;
    if (this.next) {
      const p1 = this.backboneCenter;
      const p2 = this.next.backboneCenter;
      const length = p2.clone().sub(p1).length();
      bbTransform = get2PointTransform(p1, p2).scale(
        new Vector3(this.scale, length, this.scale),
      );
    } else {
      bbTransform = new Matrix4().scale(new Vector3(0, 0, 0));
    }
    this.instanceMeshes.backbone1.setMatrixAt(this.id, bbTransform);
    this.instanceMeshes.backbone2.setMatrixAt(this.id, this.transform);
  }

  /**
   * Set the object instance colours.
   */
  updateObjectColours(colour = selectionColours.default) {
    this.instanceMeshes.backbone1.setColorAt(this.id, colour);
    this.instanceMeshes.backbone2.setColorAt(this.id, colour);
    this.instanceMeshes.nucleotides.setColorAt(this.id, colour);
    this.instanceMeshes.bases.setColorAt(this.id, nucleotideColours[this.base]);
    for (const m of _.keys(this.instanceMeshes))
      this.instanceMeshes[
        m as keyof NucleotideMeshes
      ].instanceColor.needsUpdate = true;
  }

  updateObjectVisibility() {
    this.instanceMeshes.backbone1.visible = GLOBALS.visibilityNucBackbone;
    this.instanceMeshes.backbone2.visible = GLOBALS.visibilityNucBackbone;
    this.instanceMeshes.nucleotides.visible = GLOBALS.visibilityNucBase;
    this.instanceMeshes.bases.visible = GLOBALS.visibilityNucBase;
  }

  /**
   * Returns a JSON dictionary of this nucleotide according to the UNF specification.
   *
   * @returns JSON dictionary
   */
  toUNF() {
    const backboneCenter = this.backboneCenter
      .clone()
      .multiplyScalar(1 / this.scale);
    const nucleobaseCenter = this.nucleobaseCenter
      .clone()
      .multiplyScalar(1 / this.scale);
    const hydrogenFaceDir = this.hydrogenFaceDir;
    const baseNormal = this.baseNormal;

    const next = this.next ? this.next.id : -1;
    const prev = this.prev ? this.prev.id : -1;
    const pair = this.pair ? this.pair.id : -1;

    const t = {
      id: this.id,
      nbAbbrev: this.base,
      pair: pair,
      prev: prev,
      next: next,
      pdbId: 0,
      altPositions: [
        {
          nucleobaseCenter: [
            nucleobaseCenter.x,
            nucleobaseCenter.y,
            nucleobaseCenter.z,
          ],
          backboneCenter: [
            backboneCenter.x,
            backboneCenter.y,
            backboneCenter.z,
          ],
          baseNormal: [baseNormal.x, baseNormal.y, baseNormal.z],
          hydrogenFaceDir: [
            hydrogenFaceDir.x,
            hydrogenFaceDir.y,
            hydrogenFaceDir.z,
          ],
        },
      ],
    };

    return t;
  }

  /**
   * Link this nucleotide to another with N linker nucleotides.
   *
   * @param other
   * @param N
   * @returns the generated nucleotides
   */
  linkNucleotides(other: Nucleotide, N: number): Nucleotide[] {
    const scale = new Vector3();
    const p1 = new Vector3();
    const q1 = new Quaternion();
    this.transform.decompose(p1, q1, scale);

    const p2 = new Vector3();
    const q2 = new Quaternion();
    other.transform.decompose(p2, q2, scale);

    const linkers = [];
    for (let i = 0; i < N; i++) {
      const z = (i + 1) / (N + 1);

      const pt = p1
        .clone()
        .multiplyScalar(1 - z)
        .add(p2.clone().multiplyScalar(z));
      const qt = q1.clone().slerp(q2, z);
      const transform = new Matrix4().compose(pt, qt, scale);

      const nt = new Nucleotide(this.owner);
      nt.isLinker = true;
      if (this.isScaffold) nt.isScaffold = true;
      nt.setTransform(transform);
      linkers.push(nt);
      if (i > 0) {
        linkers[i - 1].next = linkers[i];
        linkers[i].prev = linkers[i - 1];
      }
    }

    this.next = linkers[0];
    linkers[0].prev = this;
    linkers[linkers.length - 1].next = other;
    other.prev = linkers[linkers.length - 1];

    return linkers;
  }

  updateVisuals() {
    if (!this.instanceMeshes) return;

    this.updateObjectMatrices();
    this.next?.updateObjectMatrices();
    this.prev?.updateObjectMatrices();
    let m: keyof NucleotideMeshes;
    for (m in this.instanceMeshes) {
      this.instanceMeshes[m].instanceMatrix.needsUpdate = true;
    }
  }

  markSelect() {
    this.updateObjectColours(selectionColours.selection);
  }

  markHover() {
    this.updateObjectColours(selectionColours.hover);
  }

  markDefault(): void {
    this.updateObjectColours();
  }

  getTooltip(): string {
    return `${this.base}<br>${this.id}`;
  }

  getTransform(): Matrix4 {
    return this.transform.clone();
  }

  getPosition(): Vector3 {
    return this.backboneCenter.clone();
  }

  getRotation(): Quaternion {
    const pos = new Vector3();
    const rot = new Quaternion();
    const scale = new Vector3();
    this.transform.decompose(pos, rot, scale);
    return rot;
  }

  getSize(): number {
    return 1; // Nucleotide size is fixed
  }

  setTransform(m: Matrix4) {
    this.transform = m.clone();
    this.setNucleotideVectors();
    this.updateVisuals();
  }

  setPosition(pos: Vector3) {
    return; //TODO
  }

  setRotation(rot: Quaternion) {
    this.transform.compose(
      this.getPosition(),
      rot,
      new Vector3(this.scale, this.scale, this.scale),
    );
    this.updateVisuals();
  }

  setSize(val: number) {
    return; // Nucleotide size is fixed
  }
}
