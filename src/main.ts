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
class Artnet2 extends utils.Adapter {
    artnetController: ArtnetController | null = null;
    states: IdDictionary<number> = {};
    roles: IdDictionary<string> = {};
    channels: IdDictionary<number> = {};

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
        this.log.info('config host: ' + this.config.host);
        this.log.info('config port: ' + this.config.port);
        this.log.info('config universe: ' + this.config.universe);

        /*
        For every state in the system there has to be also an object of type state
        Here a simple template for a boolean variable named "testVariable"
        Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
        */
        //await this.setObjectAsync("testVariable", {
        //    type: "state",
        //    common: {
        //        name: "testVariable",
        //        type: "boolean",
        //        role: "indicator",
        //        read: true,
        //        write: true,
        //    },
        //    native: {},
        //});

        // in this template all states changes inside the adapters namespace are subscribed
        this.subscribeStates('*');

        /*
        setState examples
        you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
        */
        //// the variable testVariable is set to true as command (ack=false)
        //await this.setStateAsync("testVariable", true);

        //// same thing, but the value is flagged "ack"
        //// ack should be always set to true if the value is received from or acknowledged from the target system
        //await this.setStateAsync("testVariable", { val: true, ack: true });

        //// same thing, but the state is deleted after 30s (getState will return null afterwards)
        //await this.setStateAsync("testVariable", { val: true, ack: true, expire: 30 });

        //// examples for the checkPassword/checkGroup functions
        //let result = await this.checkPasswordAsync("admin", "iobroker");
        //this.log.info("check user admin pw iobroker: " + result);

        //result = await this.checkGroupAsync("admin", "admin");
        //this.log.info("check group user admin group admin: " + result);

        this.getStates('*', (err, states) => {
            if (err) {
                this.log.info('Could not fetch states' + err);
                return
            }
            for (let id in states) {
                if (states[id]) {
                    this.states[id] = states[id].val;
                }
            }
        });
        this.getAdapterObjects((objects) => {
            for (let id in objects) {
                let obj = objects[id];
                if (obj["type"] != "state") {
                    continue
                }
                if (! ("native" in obj)) {
                    continue
                }
                this.roles[obj["_id"]] = obj["common"]["role"];
                if (! ("channel" in obj["native"])) {
                    continue
                }
                this.channels[obj["_id"]] = obj["native"]["channel"];
            }
        });

        // instanciate artnet controller
        this.artnetController = new ArtnetController(this.config.host, this.config.port, this.config.universe);
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    private onUnload(callback: () => void): void {
        try {
            this.log.info('cleaned everything up...');
            if (this.artnetController) {
                this.artnetController.close();
            }
            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Is called if a subscribed object changes
     */
    private onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
        if (obj) {
            // The object was changed
            this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
        } else {
            // The object was deleted
            this.log.info(`object ${id} deleted`);
        }
    }

    /**
     * Is called if a subscribed state changes
     */
    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        if (state) {
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
                let channel = this.channels[id]
                this.log.info(`channel ${channel} transition to ${state.val} in ${transition} from ${oldValue}`);
                this.artnetController.setValue(channel, state.val, transition, oldValue);
                
                let stateName = id.split('.').pop();
                this.log.info(`${stateName} may change rgb`);
                if (stateName && ["red","green","blue"].includes(stateName)) {
                    let color = this.genRgbColor(baseId);
                    this.log.info(`new Rgb: ${color}`);
                    this.setState(baseId + '.rgb', color);
                }
                    
            }
            else if (this.roles[id] == "level.color.rgb") {
                this.log.info("set rgb value");
                let colors = this.splitRgbColor(state.val);
                let partId = this.getIdBase(id);
                this.setState(partId + '.red', colors[0]);
                this.setState(partId + '.green', colors[1]);
                this.setState(partId + '.blue', colors[2]);
            }
            this.states[id] = state.val;
        } else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
            if (id in this.states) {
                delete this.states[id];
            }
        }
    }

    private getIdBase(id: string): string {
        let idParts = id.split('.');
        idParts.pop();
        return idParts.join('.');
    }

    private splitRgbColor(rgb: string) {
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
        for (let color in ["red", "green", "blue"]) {
            let state = this.states[idBase + "." + color];
            if (!state)
                return "";
            let val = state.toString(16).toUpperCase();
            if (val.length < 2)
                val = '0' + val;
            hexRes += val;
        
        }
        return hexRes;
    }

    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.message" property to be set to true in io-package.json
    //  */
    // private onMessage(obj: ioBroker.Message): void {
    // 	if (typeof obj === 'object' && obj.message) {
    // 		if (obj.command === 'send') {
    // 			// e.g. send email or pushover or whatever
    // 			this.log.info('send command');

    // 			// Send response in callback if required
    // 			if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
    // 		}
    // 	}
    // }

}

if (module.parent) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<ioBroker.AdapterOptions> | undefined) => new Artnet2(options);
} else {
    // otherwise start the instance directly
    (() => new Artnet2())();
}
