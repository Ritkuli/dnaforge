import * as THREE from 'three';
import { get2PointTransform } from '../../utils/misc_utils';
import { Vector3, Intersection } from 'three';
import {
  Cylinder,
  CylinderBundle,
  CylinderModel,
  PrimePos,
  RoutingStrategy,
} from '../../models/cylinder_model';
import { NucleotideModel } from '../../models/nucleotide_model';
import { Graph, Edge, HalfEdge, Vertex } from '../../models/graph_model';
import { setPrimaryFromScaffold } from '../../utils/primary_utils';
import { STParameters } from './spanning_tree_menu';
import { Nucleotide } from '../../models/nucleotide';
import { Strand } from '../../models/strand';
import { WiresModel } from '../../models/wires_model';
import { Selectable } from '../../scene/selection_utils';
const cyclesMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

export class Veneziano extends WiresModel {
  graph: Graph;
  st: Set<Edge>;
  trail: HalfEdge[];

  obj: THREE.InstancedMesh;

  constructor(graph: Graph) {
    super();
    this.graph = graph;
    this.st = this.getPrim();
    this.trail = this.getVeneziano();
  }

  toJSON(): JSONObject {
    const st: number[] = [];
    for (const e of this.st) st.push(e.id);
    const graph = this.graph.toJSON();
    return { graph: graph, st: st };
  }

  static loadJSON(json: any) {
    const graph = Graph.loadJSON(json.graph);
    const v = new Veneziano(graph);
    const idToEdge = new Map<number, Edge>();
    for (const e of graph.edges) idToEdge.set(e.id, e);

    v.st = new Set<Edge>();
    for (const e of json.st) {
      v.st.add(idToEdge.get(e));
    }
    v.trail = v.getVeneziano();
    return v;
  }

  getVeneziano() {
    const route: HalfEdge[] = [];
    const startEdge = [...this.st][0].halfEdges[0];
    const stack = [startEdge];
    const visited = new Set();
    while (stack.length > 0) {
      const curE = stack.pop();
      const curV = curE.vertex;
      route.push(curE);
      if (!this.st.has(curE.edge)) continue;
      if (!visited.has(curV)) {
        visited.add(curV);
        let neighbours;
        try {
          neighbours = curV.getTopoAdjacentHalfEdges();
        } catch (error) {
          neighbours = this.getNeighbours(curV);
        }
        stack.push(curE.twin);
        neighbours = neighbours
          .slice(1 + neighbours.indexOf(curE))
          .concat(neighbours.slice(0, neighbours.indexOf(curE)));
        for (const n of neighbours) stack.push(n.twin);
      }
    }
    return route.slice(0, route.length - 1);
  }

  getPrim(): Set<Edge> {
    const visited = new Set();
    const st: Set<Edge> = new Set();
    const stack: Edge[] = [];

    let v0 = this.graph.getVertices()[0];
    for (const v of this.graph.getVertices()) {
      if (v.degree() > v0.degree()) v0 = v;
    }

    for (const e of v0.getAdjacentEdges()) stack.push(e);
    while (stack.length > 0) {
      const edge = stack.shift();
      const v1 = edge.vertices[0];
      const v2 = edge.vertices[1];
      if (!visited.has(v1) || !visited.has(v2)) {
        st.add(edge);
      }
      visited.add(v1);
      visited.add(v2);
      const neighbours = v1.getAdjacentEdges().concat(v2.getAdjacentEdges());
      for (let i = 0; i < neighbours.length; i++) {
        const edge2 = neighbours[i];
        const [ev1, ev2] = edge2.getVertices();
        if (!visited.has(ev1) || !visited.has(ev2)) {
          stack.push(edge2);
        }
      }
    }
    return st;
  }

  /**
   * Finds a TSP-path around the adjacent edges of the input vertex. This method allows for the routing algorithm
   * to find a reasonable path even when a topological ordering of the edges based on face information is unavailabe.
   *
   * TODO: find a more accurate TSP solution
   *
   * @param v vertex
   * @returns oredered list of edges
   */
  getNeighbours(v: Vertex): Array<HalfEdge> {
    const neighbours = v.getAdjacentHalfEdges();
    // find pairwise distances
    const distances = new Map();
    for (const e1 of neighbours) {
      const distsT: Array<[HalfEdge, number]> = [];
      const tp1 = e1.twin.vertex.coords.clone();
      for (const e2 of neighbours) {
        if (e1 == e2) continue;
        const tp2 = e2.twin.vertex.coords.clone();
        distsT.push([e2, tp2.sub(tp1).length()]);
      }
      distances.set(
        e1,
        distsT.sort((a, b) => {
          return a[1] - b[1];
        }),
      );
    }
    // traverse to NN
    const result = [];
    const visited = new Set();
    let cur = neighbours[0];
    while (result.length < neighbours.length) {
      for (const t of distances.get(cur)) {
        const e = t[0];
        if (visited.has(e)) continue;
        result.push(e);
        visited.add(e);
        cur = e;
        break;
      }
    }

    return result;
  }

  generateObject() {
    if (!this.obj) {
      const color = new THREE.Color(0xffffff);
      const count = this.st.size;
      const lineSegment = new THREE.CylinderGeometry(0.04, 0.04, 1, 4, 8);
      const lines = new THREE.InstancedMesh(lineSegment, cyclesMaterial, count);

      let i = 0;
      for (const curE of this.st) {
        const [v1, v2] = curE.getVertices();

        const co1 = v1.coords.clone();
        const co2 = v2.coords.clone();

        const length = co2.clone().sub(co1).length();
        const transform = get2PointTransform(co1, co2).scale(
          new Vector3(1, length, 1),
        );

        color.setHex(0xff0000);
        lines.setMatrixAt(i, transform);
        lines.setColorAt(i, color);
        i += 1;
      }
      this.obj = lines;
    }
    return this.obj;
  }

  handleIntersection(i: Intersection): Selectable {
    return null;
  }

  selectAll(): void {
    return;
  }

  deselectAll(): void {
    return;
  }
}

/**
 * Creates a routing model from the input graph.
 *
 * @param graph
 * @param params
 * @returns
 */
export function graphToWires(graph: Graph, params: STParameters) {
  const veneziano = new Veneziano(graph);
  return veneziano;
}

/**
 * Creates a cylinder model from the input routing model.
 *
 * @param sterna
 * @param params
 * @returns
 */
export function wiresToCylinders(veneziano: Veneziano, params: STParameters) {
  const scale = params.scale;
  const cm = new CylinderModel(scale, 'DNA');

  const trail = veneziano.trail;
  const st = veneziano.st;
  const edgeToBundle = new Map<Edge, CylinderBundle>();

  for (let i = 0; i < trail.length; i++) {
    const edge = trail[i].edge;

    if (!edgeToBundle.get(edge)) {
      const b = new CylinderBundle();
      b.isRigid = true;
      edgeToBundle.set(edge, b);
    }
    const bundle = edgeToBundle.get(edge);
    const c = createCylinder(cm, trail[i], params.greedyOffset);
    bundle.push(c);

    if (!st.has(edge)) c.routingStrategy = RoutingStrategy.Pseudoknot;
  }

  connectCylinders(cm);

  return cm;
}

/**
 * Creates a nucleotide model from the input cylinder model.
 *
 * @param cm
 * @param params
 * @returns
 */
export function cylindersToNucleotides(
  cm: CylinderModel,
  params: STParameters,
) {
  const scale = cm.scale;
  const addNicks = params.addNicks;

  const nm = new NucleotideModel(scale);

  const cylToStrands = nm.createStrands(cm, true);
  connectStrands(nm, cm, cylToStrands);
  nm.concatenateStrands();

  if (addNicks) addStrandGaps(nm);

  nm.setIDs();
  setPrimaryFromScaffold(nm, params);

  return nm;
}

function createCylinder(
  cm: CylinderModel,
  he: HalfEdge,
  greedyOffset: boolean,
) {
  const v1 = he.twin.vertex;
  const v2 = he.vertex;

  const dir = v2.coords.clone().sub(v1.coords).normalize();
  const nor = he.edge.normal.clone();
  const tan = nor.cross(dir).normalize();

  const offset = tan.multiplyScalar(-cm.scale * cm.nucParams.RADIUS);
  const offset1 = offset.clone().add(cm.getVertexOffset(v1, v2, greedyOffset));
  const offset2 = offset.clone().add(cm.getVertexOffset(v2, v1, greedyOffset));
  const p1_t = v1.coords.clone().add(offset1);
  const p2_t = v2.coords.clone().add(offset2);
  let length = p2_t.clone().sub(p1_t.clone()).length();
  if (p2_t.clone().sub(p1_t).dot(dir) < 0) length = 0;
  const length_bp = Math.floor(
    Math.round(length / cm.scale / cm.nucParams.RISE / 10.5) * 10.5,
  );
  const length_n = length_bp * cm.scale * cm.nucParams.RISE;

  const p1 = p1_t
    .clone()
    .add(dir.clone().multiplyScalar((length - length_n) / 2));

  const cyl = cm.createCylinder(p1, dir, length_bp);
  cyl.initOrientation(nor.cross(dir).applyAxisAngle(dir, cm.nucParams.AXIS));

  return cyl;
}

function connectCylinders(cm: CylinderModel) {
  let prev = cm.cylinders[0];
  for (let i = 1; i < cm.cylinders.length + 1; i++) {
    const cur = i == cm.cylinders.length ? cm.cylinders[0] : cm.cylinders[i];

    prev.neighbours[PrimePos.first3] = [cur, PrimePos.first5];
    cur.neighbours[PrimePos.first5] = [prev, PrimePos.first3];
    prev.neighbours[PrimePos.second5] = [cur, PrimePos.second3];
    cur.neighbours[PrimePos.second3] = [prev, PrimePos.second5];

    if (cur.routingStrategy == RoutingStrategy.Pseudoknot)
      prev =
        cur.bundle.cylinders[0] == cur
          ? cur.bundle.cylinders[1]
          : cur.bundle.cylinders[0];
    else prev = cur;

    if (cur.length < 31) {
      throw `A cylinder length is ${cur.length} < 31 nucleotides. Scale is too small.`;
    }
  }
}

function connectStrands(
  nm: NucleotideModel,
  cm: CylinderModel,
  cylToStrands: Map<Cylinder, [Strand, Strand]>,
) {
  const visited = new Set<Cylinder>();
  for (const cyl of cm.cylinders) {
    const scaffold_next = cylToStrands.get(
      cyl.neighbours[PrimePos.first3][0],
    )[0];
    const staple_next = cylToStrands.get(
      cyl.neighbours[PrimePos.second3][0],
    )[1];

    const otherCyl =
      cyl.bundle.cylinders[0] == cyl
        ? cyl.bundle.cylinders[1]
        : cyl.bundle.cylinders[0];

    const scaffold_cur = cylToStrands.get(cyl)[0];
    const scaffold_pair = cylToStrands.get(otherCyl)[0];
    const staple_cur = cylToStrands.get(cyl)[1];
    const staple_pair = cylToStrands.get(otherCyl)[1];

    nm.addStrand(scaffold_cur.linkStrand(scaffold_next, 5, 5));
    nm.addStrand(staple_cur.linkStrand(staple_next, 5, 5));

    visited.add(cyl);
    if (visited.has(otherCyl)) continue;

    const nucs_cur = staple_cur.nucleotides;
    const nucs_pair = staple_pair.nucleotides;
    const nucs_scaffold = scaffold_cur.nucleotides;
    const nucs_scaffold_pair = scaffold_pair.nucleotides;

    const length = nucs_cur.length;

    const reroute = (
      nucs1: Nucleotide[],
      nucs2: Nucleotide[],
      idx1: number,
      idx2: number,
    ) => {
      nucs1[idx1].next = nucs2[idx2];
      nucs2[idx2].prev = nucs1[idx1];
      nucs1[idx1 + 1].prev = nucs2[idx2 - 1];
      nucs2[idx2 - 1].next = nucs1[idx1 + 1];
    };

    //vertex staples:
    reroute(nucs_cur, nucs_pair, 10, length - 10);
    reroute(nucs_pair, nucs_cur, 10, length - 10);

    if (cyl.routingStrategy != RoutingStrategy.Pseudoknot) {
      //edge staples:
      const N42 = Math.floor((length - 21) / 21);
      for (let i = 1; i < N42 + 1; i++) {
        const idx1 = 10 + 21 * i;
        const idx2 = length - 10 - 21 * i;
        reroute(nucs_cur, nucs_pair, idx1, idx2);
      }
    } else if (cyl.routingStrategy == RoutingStrategy.Pseudoknot) {
      // scaffold crossover:
      let offset;
      if (length % 2 == 0) {
        // even
        if (length % 21 == 0) offset = 5.5;
        else offset = 0.5;
      } else {
        // odd
        if (length % 21 == 0) offset = 5;
        else offset = 0;
      }
      const idxCo1 = (length - 21) / 2 - offset + 11;
      const idxCo2 = length - (length - 21) / 2 + offset - 10;
      reroute(nucs_scaffold, nucs_scaffold_pair, idxCo1, idxCo2);

      // crossover staples:
      const N42 = Math.floor((length - 21) / 21);
      for (let i = 1; i < N42 + 1; i++) {
        const idx1 = 10 + 21 * i;
        const idx2 = length - 10 - 21 * i;
        if (idx1 > idxCo1 && idx1 < idxCo1 + 15) continue;
        reroute(nucs_cur, nucs_pair, idx1, idx2);
      }
    } else {
      throw `Unrecognised cylinder type.`;
    }
  }
}

function addStrandGaps(nm: NucleotideModel) {
  const findCrossovers = (nucs: Nucleotide[]) => {
    const cos = [];
    let i = 0;
    const l = nucs.length;
    for (; i < l; i++) {
      if (!nucs[i].pair) continue;
      if (
        nucs[i].pair.prev != nucs[(i + 1 + l) % l].pair &&
        !nucs[i].pair.prev.isLinker
      )
        cos.push(i);
    }
    return cos;
  };

  for (const s of nm.strands) {
    if (s.isScaffold) continue;
    const nucs = s.nucleotides;
    const cos = findCrossovers(nucs);
    // Vertices
    if (nucs.length > 50) {
      let start;
      if (cos.length % 2 == 0) start = 1;
      else if (cos.length == 2) start = 0;
      else start = 2;

      for (let i = start; i < cos.length; i += 2) {
        const idx = cos[i];
        nucs[idx].next.prev = null;
        nucs[idx].next = null;
      }
    }
    // Edges
    else if (cos.length == 2) {
      const idx = cos[0];
      nucs[idx].next.prev = null;
      nucs[idx].next = null;
    }
  }
  nm.concatenateStrands();
}
