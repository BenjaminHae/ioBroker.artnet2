"use strict";
/*
 * Created with @iobroker/create-adapter v1.23.0
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
// Load your modules here, e.g.:
// import * as fs from "fs";
const artnetController_1 = require("./lib/artnetController");
class Artnet2 extends utils.Adapter {
    constructor(options = {}) {
        super(Object.assign(Object.assign({}, options), { name: 'artnet2' }));
        this.artnetController = null;
        this.states = {};
        this.roles = {};
        this.channels = {};
        this.on('ready', this.onReady.bind(this));
        this.on('objectChange', this.onObjectChange.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        // this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    onReady() {
        return __awaiter(this, void 0, void 0, function* () {
            // Initialize your adapter here
            // The adapters config (in the instance object everything under the attribute "native") is accessible via
            // this.config:
            this.log.info(`host: ${this.config.host}, port: ${this.config.port}, universe: ${this.config.universe}`);
            // in this template all states changes inside the adapters namespace are subscribed
            this.subscribeStates('*');
            this.getStates('*', (err, states) => {
                if (err) {
                    this.log.info('Could not fetch states' + err);
                    return;
                }
                for (const id in states) {
                    if (states[id]) {
                        this.states[id] = states[id].val;
                    }
                }
            });
            this.getAdapterObjects((objects) => {
                for (const id in objects) {
                    const obj = objects[id];
                    this.addObject(obj);
                }
            });
            // instanciate artnet controller
            this.artnetController = new artnetController_1.ArtnetController(this.config.host, this.config.port, this.config.universe);
        });
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        try {
            this.log.info('cleaned everything up...');
            if (this.artnetController) {
                this.artnetController.close();
            }
            callback();
        }
        catch (e) {
            callback();
        }
    }
    /**
     * Is called if a subscribed object changes
     */
    onObjectChange(id, obj) {
        this.log.debug(`object ${id} changed: ${JSON.stringify(obj)}`);
        if (obj) {
            // The object was changed
            this.log.debug(`object ${id} changed: ${JSON.stringify(obj)}`);
            this.addObject(obj);
        }
        else {
            // The object was deleted
            this.log.debug(`object ${id} deleted`);
            if (id in this.roles) {
                this.log.debug(`deleting role ${id}`);
                delete this.roles[id];
            }
            if (id in this.channels) {
                this.log.debug(`deleting channel ${id}`);
                delete this.channels[id];
            }
            if (id in this.states) {
                this.log.debug(`deleting state ${id}`);
                delete this.states[id];
            }
        }
    }
    addObject(obj) {
        if (obj['type'] != 'state') {
            return;
        }
        if (!('native' in obj)) {
            return;
        }
        this.log.debug(`Storing object (${obj['_id']}) role ${obj['common']['role']}`);
        this.roles[obj['_id']] = obj['common']['role'];
        if (!('channel' in obj['native'])) {
            return;
        }
        this.log.debug(`Storing object (${obj['_id']}) channel ${obj['native']['channel']}`);
        this.channels[obj['_id']] = obj['native']['channel'];
    }
    /**
     * Is called if a subscribed state changes
     */
    onStateChange(id, state) {
        if (state) {
            this.log.debug(`object ${id} deleted`);
            if (this.artnetController && id in this.channels) {
                const baseId = this.getIdBase(id);
                const transitionId = baseId + '.transition';
                let transition = this.states[transitionId];
                if (!transition) {
                    transition = 0;
                }
                let oldValue = 0;
                if (id in this.states && this.states[id]) {
                    oldValue = this.states[id];
                }
                const channel = this.channels[id];
                this.log.debug(`${id}: channel ${channel} transition to ${state.val} in ${transition} from ${oldValue}`);
                this.artnetController.setValue(channel, state.val, transition, oldValue);
                this.states[id] = state.val;
                const stateName = id.split('.').pop();
                if (!state.ack && stateName && ['red', 'green', 'blue'].includes(stateName)) {
                    const color = this.genRgbColor(baseId);
                    if (color.length > 0) {
                        this.log.debug(`change of ${id} sets new Rgb: ${color}`);
                        this.setState(baseId + '.rgb', color, true);
                    }
                }
            }
            else if (this.roles[id] == 'level.color.rgb') {
                this.log.debug(`set new rgb value: ${id}: ${state.val}`);
                const colors = this.splitRgbColor(state.val);
                this.states[id] = state.val;
                if (!state.ack) {
                    this.log.debug(`propagating rgb value ${id}: ${state.val}`);
                    const baseId = this.getIdBase(id);
                    this.setState(baseId + '.red', colors[0], true);
                    this.setState(baseId + '.green', colors[1], true);
                    this.setState(baseId + '.blue', colors[2]), true;
                }
            }
            else if (this.roles[id] == 'level.transition') {
                this.states[id] = state.val;
            }
            else {
                this.log.debug(`unknown state change: ${id} to ${state.val}`);
            }
        }
        else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
            if (id in this.states) {
                delete this.states[id];
            }
        }
    }
    getIdBase(id) {
        const idParts = id.split('.');
        idParts.pop();
        return idParts.join('.');
    }
    splitRgbColor(rgb) {
        if (!rgb)
            rgb = '#000000';
        rgb = rgb.toString().toUpperCase();
        if (rgb[0] === '#') {
            rgb = rgb.substring(1);
        }
        if (rgb.length == 3) {
            rgb = rgb[0] + rgb[0] + rgb[1] + rgb[1] + rgb[2] + rgb[2];
        }
        const r = parseInt(rgb[0] + rgb[1], 16);
        const g = parseInt(rgb[2] + rgb[3], 16);
        const b = parseInt(rgb[4] + rgb[5], 16);
        if (rgb.length >= 8) {
            return [r, g, b, parseInt(rgb[6] + rgb[7], 16)];
        }
        else {
            return [r, g, b];
        }
    }
    genRgbColor(idBase) {
        let hexRes = '#';
        for (const color of ['red', 'green', 'blue']) {
            const state = this.states[idBase + '.' + color];
            if (!state) {
                this.log.debug(`can't create Hex color as ${idBase + '.' + color} is not set`);
                return '';
            }
            let val = state.toString(16).toUpperCase();
            if (val.length < 2)
                val = '0' + val;
            if (val.length > 2) {
                this.log.debug(`can't create Hex color as ${idBase + '.' + color} is not set`);
                return '';
            }
            hexRes += val;
        }
        return hexRes;
    }
}
if (module.parent) {
    // Export the constructor in compact mode
    module.exports = (options) => new Artnet2(options);
}
else {
    // otherwise start the instance directly
    (() => new Artnet2())();
}
