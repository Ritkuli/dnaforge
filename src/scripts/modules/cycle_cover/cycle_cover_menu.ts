import {
  CycleCover,
  graphToWires,
  wiresToCylinders,
  cylindersToNucleotides,
} from './cycle_cover';
import html from './cycle_cover_ui.htm';
import { ModuleMenu, ModuleMenuParameters } from '../module_menu';
import { Context } from '../../scene/context';
import { Graph } from '../../models/graph';
import { WiresModel } from '../../models/wires_model';
import { CylinderModel } from '../../models/cylinder_model';
import { setRandomPrimary } from '../../utils/primary_utils';
import { NucleotideModel } from '../../models/nucleotide_model';

export type CCParameters = ModuleMenuParameters;

export class CycleCoverMenu extends ModuleMenu {
  scaleInput: any;
  linkersMinInput: any;
  linkersMaxInput: any;
  gcContentInput: any;
  strandLengthMaxInput: any;
  strandLengthMinInput: any;
  addNicksSwitch: any;
  generatePrimaryButton: any;

  constructor(context: Context) {
    super(context, html);
    this.params.naType = 'DNA';
  }

  loadJSON(json: any) {
    this.reset();
    this.collectParameters();

    json.params && this.loadParameters(json.params);
    this.wires =
      json.wires && CycleCover.loadJSON(this.context.graph, json.wires);
    this.cm = json.cm && CylinderModel.loadJSON(json.cm);
    this.nm = json.nm && NucleotideModel.loadJSON(json.nm);

    this.showWires = this.wires && this.showWires; // ugly hacks to prevent always creating the models on context switch
    this.showCylinders = this.cm && this.showCylinders;
    this.showNucleotides = this.nm && this.showNucleotides;
  }

  populateHotkeys() {
    super.populateHotkeys();
    this.hotkeys.set('shift+r', this.generatePrimaryButton);
  }

  graphToWires(graph: Graph, params: CCParameters) {
    const wires = graphToWires(graph, params);
    this.context.addMessage(`Generated ${wires.length()} cycles.`, 'info');
    return wires;
  }

  wiresToCylinders(wires: WiresModel, params: CCParameters) {
    return wiresToCylinders(<CycleCover>wires, params);
  }

  cylindersToNucleotides(cm: CylinderModel, params: CCParameters) {
    return cylindersToNucleotides(cm, params);
  }

  generatePrimary() {
    if (!this.nm) this.generateNucleotideModel();

    this.collectParameters();

    setRandomPrimary(this.nm, this.params.gcContent, 'DNA');
  }

  collectParameters() {
    super.collectParameters();

    this.params.scale = 1 / parseFloat(this.scaleInput[0].value);
    this.params.minLinkers = parseInt(this.linkersMinInput[0].value);
    this.params.maxLinkers = parseInt(this.linkersMaxInput[0].value);

    this.params.gcContent = parseFloat(this.gcContentInput[0].value) / 100;
    this.params.maxStrandLength = parseInt(this.strandLengthMaxInput[0].value);
    this.params.minStrandLength = parseInt(this.strandLengthMinInput[0].value);
    this.params.addNicks = this.addNicksSwitch[0].checked;
  }

  loadParameters(json: JSONObject) {
    super.loadParameters(json);

    this.scaleInput[0].value = 1 / <number>json.scale;
    this.linkersMinInput[0].value = json.minLinkers;
    this.linkersMaxInput[0].value = json.maxLinkers;

    this.gcContentInput[0].value = <number>json.gcContent * 100;
    this.strandLengthMaxInput[0].value = json.maxStrandLength;
    this.strandLengthMinInput[0].value = json.minStrandLength;
    this.addNicksSwitch[0].checked = json.addNicks;
  }

  setupEventListeners() {
    super.setupEventListeners();

    this.scaleInput = $('#cycle-cover-scale');
    this.linkersMinInput = $('#cycle-cover-linkers-min');
    this.linkersMaxInput = $('#cycle-cover-linkers-max');
    this.gcContentInput = $('#cycle-cover-gc-content');
    this.strandLengthMaxInput = $('#cycle-cover-strand-length-max');
    this.strandLengthMinInput = $('#cycle-cover-strand-length-min');

    this.addNicksSwitch = $('#cycle-cover-add-nicks');
    this.generatePrimaryButton = $('#generate-cycle-cover-primary');

    this.generatePrimaryButton.on('click', () => {
      try {
        this.generatePrimary();
        this.regenerateVisible();
      } catch (error) {
        this.context.addMessage(error, 'alert');
      }
    });
  }
}
