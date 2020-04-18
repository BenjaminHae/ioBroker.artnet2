

function generateDeviceStates(fixture, deviceId, deviceName, firstAddress) {
    let states = JSON.parse(JSON.stringify(fixture.native.states));
    for (let state of states) {
        // get type of state
        let dpType = state.common.role.split('.').pop();
        state._id = deviceId + '.' + dpType;
        state.parent = deviceId;
        state.common.name = deviceName ? deviceName + ' ' + dpType : state._id;
        if ("channel" in state.native) {
            state.native.channel = firstAddress++;
        }
    }
    return states;
}
function generateDeviceObject(fixture, deviceName, firstAddress) {
    let deviceObj = JSON.parse(JSON.stringify(fixture.native.channel));
    deviceObj._id = 'artnet2.' + instance + '.' + fixture._id.split('.').pop() + '.' + firstAddress;
    deviceObj.common.name     = deviceName || deviceId;
    deviceObj.native.address  = firstAddress;
    deviceObj.native.length   = fixture.native.length;
    return deviceObj;
}
function createDevice(fixture, deviceName, firstAddress) {
    deviceObject = generateDeviceObject(fixture, deviceName, firstAddress);
    states = generateDeviceStates(fixture, deviceObject._id, deviceName, firstAddress);
    states.push(deviceObject);
    return states;
}
function backendInsertObj(_objs, callback) {
    if (!_objs || !_objs.length) {
        console.log('done storing devices');
        callback();
    } else {
        var obj = _objs.pop();
        console.log('Add ' + obj._id);
        socket.emit('setObject', obj._id, obj, function () {
                backendInsertObj(_objs, callback);
                });
    }
}
function createAndStoreDevices(names, firstAddress, fixtureId, callback) {
    const fixture = fixtures[fixtureId];
    let currentAddress = firstAddress;
    let channelNumber = fixture.native.length;

    let objects = [];
    for (const deviceName of names) {
        objects = objects.concat(createDevice(fixture, deviceName, currentAddress));
        currentAddress += channelNumber;
    }
    
    backendInsertObjs(objects, callback);
}
