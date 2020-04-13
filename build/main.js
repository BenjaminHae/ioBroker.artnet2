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
                    return;
                }
                for (let id in states) {
                    if (states[id])
                        this.states[id] = states[id].val;
                }
            });
            this.getAdapterObjects((objects) => {
                for (let id in objects) {
                    let obj = objects[id];
                    if (obj["type"] != "state") {
                        continue;
                    }
                    if (!("native" in obj)) {
                        continue;
                    }
                    if (!("channel" in obj["native"])) {
                        continue;
                    }
                    this.channels[obj["_id"]] = obj["native"]["channel"];
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
        if (obj) {
            // The object was changed
            this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
        }
        else {
            // The object was deleted
            this.log.info(`object ${id} deleted`);
        }
    }
    /**
     * Is called if a subscribed state changes
     */
    onStateChange(id, state) {
        if (state) {
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
            if (this.artnetController && id in this.channels) {
                let idParts = id.split('.');
                idParts.pop();
                idParts.push('transition');
                const transitionId = idParts.join('.');
                let transition = this.states[transitionId];
                if (!transition) {
                    transition = 0;
                }
                let oldValue = 0;
                if (id in this.states && this.states[id]) {
                    oldValue = this.states[id];
                }
                let channel = this.channels[id];
                this.log.info(`channel ${channel} transition to ${state.val} in ${transition} from ${oldValue}`);
                this.artnetController.setValue(channel, state.val, transition, oldValue);
            }
            this.states[id] = state.val;
        }
        else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
            if (id in this.states) {
                delete this.states[id];
            }
        }
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
