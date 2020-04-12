"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Artnet = require("artnet");
class Channel {
    constructor(channel, currentValue) {
        this.channel = channel;
        this.currentValue = Math.round(currentValue);
    }
}
class DesiredState extends Channel {
    constructor(channel, desiredValue, transitionLength, currentValue) {
        super(channel, currentValue);
        this.startValue = this.currentValue;
        this.desiredValue = Math.round(desiredValue);
        this.transitionLength = Math.round(transitionLength);
        this.transitionPosition = 0;
    }
    transition() {
        if (this.transitionPosition < this.transitionLength) {
            this.currentValue = Math.round(this.startValue + this.transitionPosition * (this.desiredValue - this.startValue) / this.transitionLength);
        }
        this.transitionPosition += 1;
        if (this.transitionPosition >= this.transitionLength) {
            this.currentValue = this.desiredValue;
        }
    }
    achieved() {
        return this.transitionPosition >= this.transitionLength;
    }
}
class ArtnetController {
    constructor(host, port, universe, periodLength = 40) {
        this.loop = null;
        this.artnet = Artnet({ host: host, port: port || 6454, sendAll: true });
        this.universe = universe;
        this.periodLength = periodLength;
        this.transitions = [];
    }
    close() {
        this.stopLoop();
        if (this.artnet) {
            this.artnet.close();
        }
    }
    setValue(channel, value, transitionLength = 0, currentValue = 0) {
        const state = new DesiredState(channel, value, transitionLength, currentValue);
        this.transitions.push(state);
        this.initLoop();
    }
    initLoop() {
        if (!this.loop) {
            this.loop = setInterval(() => this.stateLoop(), this.periodLength);
        }
    }
    stopLoop() {
        if (this.loop) {
            clearInterval(this.loop);
            this.loop = null;
        }
    }
    sendToArtnet(channels) {
        channels.sort((a, b) => { return a.channel - b.channel; });
        const startAddress = channels[0].channel;
        let currentAddress = startAddress;
        const values = [];
        for (const item of channels) {
            while (currentAddress < item.channel) {
                values.push(null);
                currentAddress += 1;
            }
            values.push(item.currentValue);
            currentAddress += 1;
        }
        this.artnet.set(this.universe, startAddress, values);
    }
    stateLoop() {
        if (this.transitions.length) {
            // calculate new channel-values
            for (const state of this.transitions) {
                state.transition();
            }
            // send values to artnet
            this.sendToArtnet(this.transitions);
            // remove values that have been achieved
            this.transitions = this.transitions.filter((state) => !state.achieved());
        }
        // kill loop if all transitions are done
        if (this.transitions.length == 0) {
            this.stopLoop();
        }
    }
}
exports.ArtnetController = ArtnetController;
