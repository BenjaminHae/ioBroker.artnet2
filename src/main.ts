/*
 * Created with @iobroker/create-adapter v1.23.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';

// Load your modules here, e.g.:
// import * as fs from "fs";
import { ArtnetController } from './lib/artnetController';

// Augment the adapter.config object with the actual types
// TODO: delete this in the next version
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace ioBroker {
        interface AdapterConfig {
            // Define the shape of your options here (recommended)
            host: string;
            port: number;
            universe: number;
        }
    }
}

interface IdDictionary<T> {
    [key: string]: T;
}
type SwitchState = 0 | 1;

class Artnet2 extends utils.Adapter {
    artnetController: ArtnetController | null = null;
    states: IdDictionary<number> = {};
    roles: IdDictionary<string> = {};
    channels: IdDictionary<number> = {};
    switchStates: IdDictionary<SwitchState> = {};

    public constructor(options: Partial<ioBroker.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'artnet2',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('objectChange', this.onObjectChange.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        // this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        // Initialize your adapter here

        // The adapters config (in the instance object everything under the attribute "native") is accessible via
        // this.config:
        this.log.info(`host: ${this.config.host}, port: ${this.config.port}, universe: ${this.config.universe}`);

        // in this template all states changes inside the adapters namespace are subscribed
        this.subscribeStates('*');

        this.subscribeObjects('*');

        this.log.debug(`reading objects`);
        this.getAdapterObjects((objects) => {
            for (const id in objects) {
                const obj = objects[id];
                this.log.debug(`adding object ${id}`);
                this.addObject(obj);
            }
        });

        this.log.debug(`reading states`);
        this.getStates('*', (err, states) => {
            if (err) {
                this.log.info('Could not fetch states' + err);
                return
            }
            for (const id in states) {
                if (states[id]) {
                    this.log.debug(`parsing state ${id}`);
                    // if it is a switch state
                    if (this.roles[id] == "switch") {
                        this.log.debug(`storing switch state ${id}: ${states[id].val}`);
                        this.switchStates[this.getIdBase(id)] = states[id].val ? 1 : 0;
                    }
                    // if it is a number state
                    else {
                        this.log.debug(`storing state ${id}: ${states[id].val}`);
                        this.states[id] = states[id].val;
                    }
                }
            }
        });

        // instanciate artnet controller
        this.log.debug(`instanciating ArtnetController: ${this.config.host}:${this.config.port}: ${this.config.universe}`);
        this.artnetController = new ArtnetController(this.config.host, this.config.port, this.config.universe);
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    private onUnload(callback: () => void): void {
        try {
            if (this.artnetController) {
                this.artnetController.close();
            }
            this.log.info('cleaned everything up...');
            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Is called if a subscribed object changes
     */
    private onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
        this.log.debug(`object ${id} changed`);
        if (obj) {
            // The object was changed
            this.log.debug(`adding object ${id} data: ${JSON.stringify(obj)}`);
            this.addObject(obj);
        } else {
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
            if (this.getIdBase(id) in this.switchStates) {
                this.log.debug(`deleting state ${id}`);
                delete this.switchStates[this.getIdBase(id)];
            }
        }
    }

    private addObject(obj: ioBroker.Object): void {
        const id = obj['_id'];
        if (obj['type'] != 'state') {
            this.log.debug(`addObject: ${id} is not of type state`);
            return
        }
        this.log.debug(`Storing object (${id}) role ${obj['common']['role']}`);
        this.roles[id] = obj['common']['role'];
        if (! ('native' in obj)) {
            this.log.debug(`addObject: ${id} has no native values`);
            return
        }
        if (! ('channel' in obj['native'])) {
            this.log.debug(`addObject: ${id} has no channel`);
            return
        }
        this.log.debug(`Storing object (${id}) channel ${obj['native']['channel']}`);
        this.channels[id] = obj['native']['channel'];
    }

    /**
     * Is called if a subscribed state changes
     */
    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        if (state) {
            this.log.debug(`state change event ${id}: ${state.val}, ack: ${state.ack}`);
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
                const channel = this.channels[id]

                // set channel according to switchState
                let switchFactor = this.switchStates[this.getIdBase(id)];
                this.log.debug(`Stored Switch Factor for ${id} is ${switchFactor}`);
                if (switchFactor !== 1 && switchFactor !== 0) {
                    switchFactor = 1;
                    this.log.debug(`Switch Factor set to 1`);
                }
                let effectiveValue = state.val * switchFactor;
                this.log.debug(`channel ${channel} value is ${state.val}, switch is set to ${switchFactor}`);
                this.log.debug(`${id}: channel ${channel} transition to ${effectiveValue} in ${transition} from ${oldValue}`);
                this.artnetController.setValueFromCurrentValue(channel, effectiveValue, this.transitionTimeToSteps(transition), oldValue);

                this.states[id] = state.val;
                
                const stateName = id.split('.').pop();
                if (!state.ack && stateName && ['red','green','blue'].includes(stateName)) {
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
                this.log.debug(`storing new transition ${id}: ${state.val}`);
                this.states[id] = state.val;
            }
            else if (this.roles[id] == 'switch') {
                const baseId = this.getIdBase(id);
                this.log.debug(`switch ${id} for object ${baseId} was set to: ${state.val}`);
                this.switchStates[baseId] = state.val ? 1 : 0;

                // update affected channels
                const affChannels = this.getObjectChannels(baseId);
                for (let channelId of affChannels) {
                    this.log.debug(`updating affected channel ${channelId}`);
                    this.setState(channelId, this.states[channelId], true);
                }
            }
            else {
                this.log.debug(`unknown state change: ${id} to ${state.val}`);
            }
            this.log.debug(`reached end of state change for ${id}`);
        } else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
            if (id in this.states) {
                delete this.states[id];
            }
        }
    }

    private transitionTimeToSteps(transitionTime: number): number {
        if (!this.artnetController)
            return 0;
        return Math.floor(transitionTime / this.artnetController.periodLength);
    }

    private getIdBase(id: string): string {
        const idParts = id.split('.');
        idParts.pop();
        return idParts.join('.');
    }

    private getObjectChannels(baseId: string): Array<string> {
        if (!baseId.endsWith('.')) {
            baseId += '.';
        }
        const keys = Object.keys(this.channels);
        return keys.filter((elt) => elt.startsWith(baseId));
    }

    private splitRgbColor(rgb: string): Array<number> {
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
        } else {
            return [r, g, b];
        }
    }

    private genRgbColor(idBase: string): string{
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
                this.log.debug(`can't create Hex color as ${idBase + '.' + color} is too long (val: ${val}, state: ${state})`);
                return '';
            }
            hexRes += val;
        }
        return hexRes;
    }
}

if (module.parent) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<ioBroker.AdapterOptions> | undefined) => new Artnet2(options);
} else {
    // otherwise start the instance directly
    (() => new Artnet2())();
}
