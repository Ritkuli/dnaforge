import { Event, Intersection, Object3D } from 'three';
import { Model } from './model';
import { Selectable } from '../scene/selection_utils';
import { ModuleMenu } from '../scene/module_menu';

abstract class WiresModel extends Model {
  obj?: THREE.InstancedMesh;
  owner?: ModuleMenu;

  abstract toJSON(): JSONObject;

  //abstract static loadJSON(json: any): WiresModel; // Typescript does not support abstract static, but all wires models should implement this.

  abstract selectAll(): void;

  abstract deselectAll(): void;

  abstract generateObject(): Object3D;

  abstract handleIntersection(i: Intersection): Selectable;

  /**
   * Delete the 3d model and free up the resources.
   */
  dispose() {
    this.obj.geometry.dispose();
    delete this.obj;
  }

  show() {
    this.obj.layers.set(0);
    if (this.obj) {
      this.isVisible = true;
      for (const o of this.obj.children) o.layers.set(0);
    }
  }

  hide() {
    this.obj.layers.set(1);
    if (this.obj) {
      this.isVisible = false;
      for (const o of this.obj.children) o.layers.set(1);
    }
  }

  getSelection(
    event: string,
    target?: Selectable,
    mode?: 'none' | 'single' | 'limited' | 'connected',
  ): Selectable[] {
    //TODO
    return [];
  }
}

export { WiresModel };
