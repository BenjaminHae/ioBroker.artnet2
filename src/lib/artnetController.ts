import * as Artnet from 'artnet';

class Channel {
    channel: number;
    currentValue: number;

    constructor (channel: number, currentValue: number) {
        this.channel = channel;
        this.currentValue = Math.round(currentValue);
    }
}

class DesiredState extends Channel {
    desiredValue: number;
    startValue: number;
    transitionPosition: number;
    transitionLength: number;

    constructor (channel: number, desiredValue: number, transitionLength: number, currentValue: number) {
        super(channel, currentValue);
        this.startValue = this.currentValue;
        this.desiredValue = Math.round(desiredValue);
        this.transitionLength = Math.round(transitionLength);
        this.transitionPosition = 0;
    }

    transition(): void {
        if (this.transitionPosition < this.transitionLength) {
            this.currentValue = Math.round(this.startValue + this.transitionPosition * (this.desiredValue - this.startValue) / this.transitionLength);
        }
        this.transitionPosition += 1;
        if (this.transitionPosition >= this.transitionLength) {
            this.currentValue = this.desiredValue;
        }
    }

    achieved(): boolean {
        return this.transitionPosition >= this.transitionLength;
    }
}

export class ArtnetController {
    artnet: any;
    universe: number;
    transitions: DesiredState[];
    loop: NodeJS.Timeout | null = null;
    periodLength: number;
    

    constructor (host: string, port: number, universe: number, periodLength = 40) {
        this.artnet = Artnet({host: host, port: port || 6454, sendAll: true});
        this.universe = universe;
        this.periodLength = periodLength;
        this.transitions = [];
    }

    close (): void {
        this.stopLoop();
        if (this.artnet) {
            this.artnet.close();
        }
    }

    getStateForChannel(channel: number): DesiredState | undefined {
        return this.transitions.find(element => element.channel == channel);
    }

    setValue(channel: number, value: number, transitionLength = 0, currentValue = 0): void {
        const state = new DesiredState(channel, value, transitionLength, currentValue);
        this.transitions = this.transitions.filter( (state: DesiredState) => state.channel != channel );
        this.transitions.push(state);
        
        this.initLoop();
    }

    setValueFromCurrentValue(channel: number, value: number, transitionLength = 0, currentValue = 0): void {
        const state = this.getStateForChannel(channel);
        if (state)
            currentValue = state.currentValue;
        this.setValue(channel, value, transitionLength, currentValue);
    }

    initLoop(): void {
        if (! this.loop) {
            this.loop = setInterval(() => this.stateLoop(), this.periodLength);
        }
    }
    
    stopLoop(): void {
        if (this.loop) {
            clearInterval(this.loop);
            this.loop = null;
        }
    }

    sendToArtnet(channels: Array<Channel>): void {
        channels.sort( (a: Channel, b: Channel) => { return a.channel - b.channel });
        const startAddress: number = channels[0].channel;
        let currentAddress: number = startAddress;
        const values: Array<number | null> = [];
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

    stateLoop(): void {
        if (this.transitions.length) {
            // calculate new channel-values
            for (const state of this.transitions) {
                state.transition();
            }

            // send values to artnet
            this.sendToArtnet(this.transitions);

            // remove values that have been achieved
            this.transitions = this.transitions.filter ( (state: DesiredState) => !state.achieved() );
        }

        // kill loop if all transitions are done
        if (this.transitions.length == 0) {
            this.stopLoop();
        }
    }
}

