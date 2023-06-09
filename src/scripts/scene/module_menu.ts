import { CylinderModel } from '../models/cylinder_model';
import { Graph } from '../models/graph_model';
import { NucleotideModel } from '../models/nucleotide_model';
import { WiresModel } from '../models/wires_model';
import { Context } from './context';
import { Menu, MenuParameters } from './menu';
import { downloadTXT } from '../io/download';
import { IUPAC_CHAR_DNA, IUPAC_CHAR_RNA } from '../globals/consts';

//TODO: Get rid of the question marks.
export interface ModuleMenuParameters extends MenuParameters {
  naType?: 'DNA' | 'RNA';
  scale?: number;
  minLinkers?: number;
  maxLinkers?: number;
  linkerOptions?: IUPAC_CHAR_DNA[] | IUPAC_CHAR_RNA[];
  minStrandLength?: number;
  maxStrandLength?: number;
  gcContent?: number;
  addNicks?: boolean;
  scaffoldName?: string;
  customScaffold?: string;
  scaffoldOffset?: number;
  scaffoldStart?: number;
  greedyOffset?: boolean;

  showWires?: boolean;
  showCylinders?: boolean;
  showNucleotides?: boolean;
}

export interface RelaxParameters {
  iterations: number;
  floorConstraints: boolean;
  bundleConstraints: boolean;
  springConstraints: boolean;
}

function setupHTML(html: string) {
  const mainData = $('<div>');
  mainData.html(html);
  const id = mainData.children()[0].id;
  const title = $(mainData.children()[0]).attr('data-title');

  const tabData = $('<li>');
  tabData.attr('id', id + '-tab');
  tabData.html(`<a href = "#${id}">${title}</a>`);

  $('#content-holder').append(mainData);
  $('#main-tabs-holder').append(tabData);
  return [id, title];
}

/**
 * Connects the HTML frontend to a routing algorithm and the wireframe-, cylinder- and nucleotide-models.
 * The routing algorithm implementations should inherit from this class.
 */
export abstract class ModuleMenu extends Menu {
  params: ModuleMenuParameters;

  wires: WiresModel;
  cm: CylinderModel;
  nm: NucleotideModel;

  wiresButton: any;
  cylindersButton: any;
  nucleotidesButton: any;
  relaxButton: any;
  generateWiresButton: any;
  generateCylindersButton: any;
  generateNucleotidesButton: any;

  /**
   *
   *
   * @param context Global context of the program.
   * @param html The HTML file containing the frontend for this model.
   */
  constructor(context: Context, html: string) {
    const [id, title] = setupHTML(html);
    super(context, id, title, false);
    this.title = title;
    this.params.linkerOptions = ['W'];
  }

  toJSON(selection: JSONObject): JSONObject {
    this.collectParameters();

    const params = this.params as JSONObject;
    const wires = selection['wires'] && this.wires && this.wires.toJSON();
    const cm = selection['cm'] && this.cm && this.cm.toJSON();
    const nm = selection['nm'] && this.nm && this.nm.toJSON();

    return { params: params, wires: wires, cm: cm, nm: nm };
  }

  loadJSON(json: any) {
    this.reset();
    this.collectParameters();

    json.params && this.loadParameters(json.params);
    this.wires = json.wires && this.jsonToWires(json.wires);
    this.cm = json.cm && CylinderModel.loadJSON(json.cm);
    this.nm = json.nm && NucleotideModel.loadJSON(json.nm);

    this.wires &&
      this.context.editor.addModel(this.wires, this.params.showWires);
    this.cm && this.context.editor.addModel(this.cm, this.params.showCylinders);
    this.nm &&
      this.context.editor.addModel(this.nm, this.params.showNucleotides);
  }

  /**
   * Assigns keys to functions or buttons.
   */
  registerHotkeys() {
    this.context.controls.registerHotkey('1', this.wiresButton, this);
    this.context.controls.registerHotkey('2', this.cylindersButton, this);
    this.context.controls.registerHotkey('3', this.nucleotidesButton, this);
    this.context.controls.registerHotkey('shift+r', this.relaxButton, this);
    this.context.controls.registerHotkey(
      'space',
      this.generateWiresButton,
      this,
    );
    this.context.controls.registerHotkey(
      'c',
      () => {
        this.select5p(true);
      },
      this,
    );
    this.context.controls.registerHotkey(
      'shift+c',
      () => {
        this.select5p(false);
      },
      this,
    );
  }

  abstract jsonToWires(json: JSONObject): WiresModel;

  /**
   * Creates a routing model from the graph.
   *
   * @param graph
   * @param params
   */
  abstract graphToWires(graph: Graph, params: ModuleMenuParameters): WiresModel;

  /**
   * Creates a cylinder model from the routing model.
   *
   * @param wires
   * @param params
   */
  abstract wiresToCylinders(
    wires: WiresModel,
    params: ModuleMenuParameters,
  ): CylinderModel;

  /**
   *
   * Creates a nucleotide model from the cylinder model.
   *
   * @param cm
   * @param params
   */
  abstract cylindersToNucleotides(
    cm: CylinderModel,
    params: ModuleMenuParameters,
  ): NucleotideModel;

  /**
   * Activate this context and unhide the associated models.
   */
  activate() {
    this.params.showWires && this.wires?.show();
    this.params.showCylinders && this.cm?.show();
    this.params.showNucleotides && this.nm?.show();
  }

  /**
   * Inactivate this context and hide the associated models.
   */
  inactivate() {
    this.wires?.hide();
    this.cm?.hide();
    this.nm?.hide();
  }

  /**
   * Resets this context to its original state. Destroys all associated models.
   */
  reset() {
    this.removeWires(true);
    this.removeCylinders(true);
    this.removeNucleotides(true);
  }

  select5p(onlyScaffold = true) {
    //this.params.showNucleotides && this.nm && this.nm.select5p(onlyScaffold);
  }

  /**
   * Generate a wireframe / routing model based on the current graph and parameters. Remove the previous version.
   */
  generateWires() {
    // remove old:
    this.removeWires(true);
    this.removeCylinders(true);
    this.removeNucleotides(true);

    this.collectParameters();

    const graph = this.context.graph;
    if (!graph) throw 'No model is loaded.';
    this.wires = this.graphToWires(graph, this.params);
    this.context.editor.addModel(this.wires, this.params.showWires);
  }

  /**
   * Generate a cylinder model based on the current routing model and parameters. Remove the previous version.
   */
  generateCylinderModel() {
    // remove old:
    this.removeCylinders(true);
    this.removeNucleotides(true);

    this.collectParameters();

    if (!this.wires) this.generateWires();

    this.cm = this.wiresToCylinders(this.wires, this.params);
    this.context.editor.addModel(this.cm, this.params.showCylinders);
  }

  /**
   * Generate a nucleotide model based on the current cylinder model and parameters. Remove the previous version.
   */
  generateNucleotideModel() {
    // remove old:
    this.removeNucleotides(true);

    this.collectParameters();

    if (!this.cm) this.generateCylinderModel();

    this.nm = this.cylindersToNucleotides(this.cm, this.params);
    this.context.editor.addModel(this.nm, this.params.showNucleotides);
    this.context.addMessage(
      `Created: ${this.nm.length()} nucleotides.`,
      'info',
    );
  }

  /**
   * Relax the cylinder model by rotating its constituent cylinders.
   */
  @editOp('cm')
  @editOp('nm')
  async relaxCylinders() {
    try {
      if (!this.cm) this.generateCylinderModel();
    } catch (error) {
      this.context.addMessage(error, 'alert');
      return;
    }
    const initialScore = Math.round(this.cm.calculateRelaxScore());
    await this.cm.relax();
    const finalScore = Math.round(this.cm.calculateRelaxScore());

    this.removeNucleotides(true);
    if (this.context.activeContext == this) this.regenerateVisible();

    this.context.addMessage(
      `Cylinders relaxed.<br>Initial score: ${initialScore}<br>Final score: ${finalScore}`,
      'info',
    );
  }

  /**
   * Add the wireframe model to the scene. Generate the model if it does not exist.
   */
  addWires() {
    if (!this.wires) this.generateWires();
    if (this.wires) this.wires.show();
  }

  /**
   * Remove the wireframe model from the scene.
   *
   * @param dispose Delete the model entirely.
   */
  removeWires(dispose = false) {
    if (!this.wires) return;
    this.wires.hide();
    if (dispose) {
      this.wires.dispose();
      this.wires = null;
    }
  }

  /**
   * Add the cylinder model to the scene. Generate it if it does not exist.
   */
  addCylinders() {
    if (!this.cm) this.generateCylinderModel();
    if (this.cm) this.cm.show();
  }

  /**
   * Remove the cylinder model from the scene.
   *
   * @param dispose Delete the model entirely.
   */
  removeCylinders(dispose = false) {
    if (!this.cm) return;
    this.cm.hide();
    if (dispose) {
      this.cm.dispose();
      this.cm = null;
    }
  }

  /**
   * Add the nucleotide model to the scene. Generate it if it does not exist.
   */
  addNucleotides() {
    if (!this.nm) this.generateNucleotideModel();
    if (this.nm) this.nm.show();
  }

  /**
   * Remove the nucleotide model from the scene.
   *
   * @param dispose Delete the model entirely.
   */
  removeNucleotides(dispose = false) {
    if (!this.nm) return;
    this.nm.hide();
    if (dispose) {
      this.nm.dispose();
      this.nm = null;
    }
  }

  /**
   * Add all models marked as shown to the scene. Generate them if they do not exist.
   */
  regenerateVisible() {
    this.params.showWires && this.addWires();
    this.params.showCylinders && this.addCylinders();
    this.params.showNucleotides && this.addNucleotides();

    this.updateVisuals();
  }

  updateVisuals() {
    const active = this.context.activeContext == this;

    if (this.params.showWires && active) this.wires?.show();
    else this.wires?.hide();
    if (this.params.showCylinders && active) this.cm?.show();
    else this.cm?.hide();
    if (this.params.showNucleotides && active) this.nm?.show();
    else this.nm?.hide();

    //this.wires?.updateObject();
    this.cm?.updateObject();
    this.nm?.updateObject();
  }

  downloadUNF() {
    try {
      const str = JSON.stringify(this.nm.toUNF());
      downloadTXT(`${this.elementId}.unf`, str);
    } catch (error) {
      throw `Nucleotide model not defined.`;
    }
  }

  downloadOx() {
    try {
      const top = this.nm.toTop();
      const dat = this.nm.toDat();
      const forces = this.nm.toExternalForces();
      downloadTXT(`${this.elementId}.top`, top);
      downloadTXT(`${this.elementId}.dat`, dat);
      downloadTXT(`${this.elementId}-forces`, forces);
    } catch (error) {
      throw `Nucleotide model not defined.`;
    }
  }

  downloadForces() {
    try {
      const forces = this.nm.toExternalForces();
      downloadTXT(`${this.elementId}-forces`, forces);
    } catch (error) {
      throw `Nucleotide model not defined.`;
    }
  }

  downloadStrands() {
    try {
      const strands = this.nm.toStrands();
      downloadTXT(`${this.elementId}-strands`, strands);
    } catch (error) {
      throw `Nucleotide model not defined.`;
    }
  }

  /**
   * Connect all the HTML elements to this object. Add their event listeners.
   */
  setupEventListeners() {
    super.setupEventListeners();
    const register = (this.registerParameter<ModuleMenuParameters>).bind(this);

    register('showWires', `${this.elementId}-toggle-wires`);
    register('showCylinders', `${this.elementId}-toggle-cylinders`);
    register('showNucleotides', `${this.elementId}-toggle-nucleotides`);

    this.wiresButton = $(`#${this.elementId}-toggle-wires`);
    this.cylindersButton = $(`#${this.elementId}-toggle-cylinders`);
    this.nucleotidesButton = $(`#${this.elementId}-toggle-nucleotides`);

    this.relaxButton = $(`#${this.elementId}-relax`);

    this.generateWiresButton = $(`#${this.elementId}-generate-wires`);
    this.generateCylindersButton = $(`#${this.elementId}-generate-cylinders`);
    this.generateNucleotidesButton = $(
      `#${this.elementId}-generate-nucleotides`,
    );

    const blur = () => {
      (document.activeElement as HTMLElement).blur();
    };

    const tryError = (f: () => void) => {
      try {
        f.call(this);
      } catch (error) {
        this.context.addMessage(error, 'alert');
      }
      blur();
    };

    $(`#${this.elementId}-download-unf`).on('click', () => {
      tryError(this.downloadUNF);
    });

    $(`#${this.elementId}-download-ox`).on('click', () => {
      tryError(this.downloadOx);
    });

    $(`#${this.elementId}-download-strands`).on('click', () => {
      tryError(this.downloadStrands);
    });

    this.wiresButton.on('click', () => {
      tryError(() => {
        this.params.showWires = this.wiresButton[0].checked;
        this.regenerateVisible();
      });
    });

    this.cylindersButton.on('click', () => {
      tryError(() => {
        this.params.showCylinders = this.cylindersButton[0].checked;
        this.regenerateVisible();
      });
    });

    this.nucleotidesButton.on('click', () => {
      tryError(() => {
        this.params.showNucleotides = this.nucleotidesButton[0].checked;
        this.regenerateVisible();
      });
    });

    this.relaxButton.on('click', () => {
      tryError(this.relaxCylinders);
    });

    this.generateWiresButton.on('click', () => {
      tryError(() => {
        this.generateWires();
        this.regenerateVisible();
      });
    });

    this.generateCylindersButton.on('click', () => {
      tryError(() => {
        this.generateCylinderModel();
        this.regenerateVisible();
      });
    });

    this.generateNucleotidesButton.on('click', () => {
      tryError(() => {
        this.generateNucleotideModel();
        this.regenerateVisible();
      });
    });
  }
}

export function editOp(t: any) {
  return function (
    target: any,
    methodName: string,
    descriptor?: PropertyDescriptor,
  ) {
    let originalFunction = target[methodName];
    let auditFunction = async function (this: any) {
      this.context.editor.startOP();
      // clone the current model and use the clone for the operation, so the original
      // model and anything depending on it stays unaffected and the operation undoable
      const prev = this[t];
      this.context.editor.removeModel(this[t]);
      this[t] = prev ? prev.clone() : null;
      this.context.editor.addModel(this[t]);
      this.updateVisuals();

      await originalFunction.apply(this, arguments);
      const after = this[t];

      this.context.editor.do({
        undo: () => {
          this.context.editor.removeModel(this[t]);
          this[t] = prev;
          this.context.editor.addModel(this[t]);
          this.updateVisuals();
        },
        redo: () => {
          this.context.editor.removeModel(this[t]);
          this[t] = after;
          this.context.editor.addModel(this[t]);
          this.updateVisuals();
        },
      });
      this.context.editor.finishOP();
    };
    target[methodName] = auditFunction;
    return target;
  };
}
