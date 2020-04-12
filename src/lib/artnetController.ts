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
  transitionPosition: number;
  transitionLength: number;

  constructor (channel: number, desiredValue: number, transitionLength:number, currentValue: number) {
    super(channel, currentValue);
    this.desiredValue = Math.round(desiredValue);
    this.transitionLength = Math.round(transitionLength);
    this.transitionPosition = 0;
  }

  transition():void {
    if (this.transitionPosition < this.transitionLength) {
      this.currentValue = Math.round(this.currentValue + (this.desiredValue - this.currentValue) / (this.transitionLength - this.transitionPosition));
    }
    this.transitionPosition += 1;
    if (this.transitionPosition >= this.transitionLength) {
      this.currentValue = this.desiredValue;
    }
  }
}

export class ArtnetController {
  artnet: any;
  universe: number;
  transitions: DesiredState[];
  loop: NodeJS.Timeout = null;

  constructor (host: string, port: number, universe:number) {
    this.artnet = require('artnet')({host: host, port: port || 6454, sendAll: true});
    this.universe = universe;
    this.transitions = [];
  }

  close (): void {
    if (this.artnet) {
      this.artnet.close();
    }
  }

  setValue(channel: number, value: number, transitionLength: number = 0, currentValue: number = 0) {
    let state = new DesiredState(channel, value, transitionLength, currentValue);
    this.transitions.push(state);
    
    this.initLoop();
  }

  initLoop() {
    if (! this.loop) {
      this.loop = setInterval(() => this.stateLoop(), 40);
    }
  }
  
  stopLoop() {
    if (this.loop) {
      clearInterval(this.loop);
      this.loop = null;
    }
  }

  sendToArtnet(channels: Array<Channel>): void {
    channels.sort( (a:Channel, b:Channel) => { return a.channel - b.channel });
    let startAddress: number = channels[0].channel;
    let currentAddress: number = startAddress;
    let values: Array<number> = [];
    for (let item of channels) {
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
      for (let state of this.transitions) {
        state.transition();
      }

      // send values to artnet
      this.sendToArtnet(this.transitions);

      // remove values that have been achieved
      function filter (state: DesiredState) {
        return state.transitionPosition < state.transitionLength;
      }
      this.transitions = this.transitions.filter ( filter );
    }

    // kill loop if all transitions are done
    if (this.transitions.length == 0) {
      this.stopLoop();
    }
  }
}

