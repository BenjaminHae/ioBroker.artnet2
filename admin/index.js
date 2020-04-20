var fixtures = {};
var nextChannel = 0;
// This will be called by the admin adapter when the settings page loads
function load(settings, onChange) {
    // example: select elements with id=key and class=value and insert value
    if (!settings) return;
    $('.value').each(function () {
        var $key = $(this);
        var id = $key.attr('id');
        if ($key.attr('type') === 'checkbox') {
            // do not call onChange direct, because onChange could expect some arguments
            $key.prop('checked', settings[id])
            .on('change', () => onChange())
            ;
        } else {
            // do not call onChange direct, because onChange could expect some arguments
            $key.val(settings[id])
            .on('change', () => onChange())
            .on('keyup', () => onChange())
            ;
        }
    });
    onChange(false);
    // reinitialize all the Materialize labels on the page if you are dynamically adding inputs:
    if (M) M.updateTextFields();

    loadFixtures();
    loadNextChannel();

    $('#artnet_add_device').off('click').on('click', function () {
            const name         = $('#artnet_add_device_name').val();
            const firstAddress = parseInt($('#artnet_add_device_first-address').val(), 10);
            const fixtureId      = $('#artnet_add_device_fixture').val();
            const count        = parseInt($('#artnet_add_device_fixture-count').val(), 10);

            let names = [];

            if (count === 1) {
                names.push(name);
            } else {
                for (var i = 1; i <= count; i++) {
                    names.push(name + ' ' + i);
                }
            }
            createAndStoreDevices(names, firstAddress, fixtureId, () => {
                M.toast({html: _('add success')});
            });
        });
    $('#show_artnet_add').off('click').on('click', function () {

        $('#artnet_add_device_name').val(_("new fixture"));
        $('#artnet_add_device_fixture-count').val(1);
        $('#artnet_add_device_first-address').val(nextChannel);
        $('#dialog-fixture').modal('open');
    });
    $('#dialog-fixture').modal();
}

// This will be called by the admin adapter when the user presses the save button
function save(callback) {
    // example: select elements with class=value and build settings object
    var obj = {};
    $('.value').each(function () {
        var $this = $(this);
        if ($this.attr('type') === 'checkbox') {
            obj[$this.attr('id')] = $this.prop('checked');
        } else {
            obj[$this.attr('id')] = $this.val();
        }
    });
    callback(obj);
}

function loadFixtures(){
    socket.emit('getObjectView', 'system', 'meta', {startkey: 'artnet2.meta.', endkey: 'artnet2.meta.\u9999', include_docs: true}, function (err, res) {
        for (let i = res.rows.length - 1; i >= 0; i--) {
            const row = res.rows[i];
            fixtures[row.id] = row.value;
            console.log("adding fixture option " + row.id + " by name " + _(row.value.native.channel.common.role));
            $('#artnet_add_device_fixture').append('<option value="' + row.id + '">' + _(row.value.native.channel.common.role) + '</option>');
        }
        $('#artnet_add_device_fixture').select();
    });
}
function loadNextChannel() {
    socket.emit('getObjectView', 'system', 'channel', {startkey: 'artnet2.' + instance + '.', endkey: 'artnet2.' + instance + '.\u9999', include_docs: true}, function (err, res) {
            res.rows.sort(function (a, b) {
                    return a.value.native.address > b.value.native.address;
                });
            if (res.rows.length > 0) {
                let lastDevice = res.rows[res.rows.length - 1];
                nextChannel = lastDevice.value.native.address + lastDevice.value.native.length;
            }
        });
}

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
    nextChannel = Math.max(currentAddress, nextChannel);
    
    backendInsertObj(objects, callback);
}
