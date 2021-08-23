/* jshint -W097 */ // jshint strict:false
/*jslint node: true */

'use strict';
const utils = require('@iobroker/adapter-core'); // Get common adapter utils
const axios = require('axios').default;
let callReadPrinter;
let ip = '';
const baselevel = 50; // bedeutet: in der Webseite wird ein Balken von 100% Höhe 50px hoch gezeichnet.
// Also entspricht ein gezeigtes Tintenlevel von 25 (px) dann 50% und eines von 10 (px) dann 20%
let sync = 10;
let isUnloaded = false;
let adapter;

function startAdapter(options) {
    options = options || {};
    Object.assign(options, {
        name: 'epson_ecotank_et_2750',
        useFormatDate: true,
        unload: function (callback) {
            try {
                stopReadPrinter();
                isUnloaded = true;
                callback();
            } catch (e) {
                callback();
            }
        },
        ready: function () {
            readSettings();
            main();
            adapter.setState('info.connection', false, true);
        }
    });
    adapter = new utils.Adapter(options);
    return adapter;
}

const ink = {
    'cyan' : {
        'state': 'cyan',
        'name': 'Cyan',
        'inklvl_rx':  "IMAGE\\/Ink_C\\.PNG\\' height=\\'([0-9]{1,2})\\'",
        'cartridge_rx': '\\(C\\)&nbsp;\\:<\\/span><\\/dt><dd class=\\"value clearfix\\"><div class=\\"preserve-white-space\\">([a-zA-Z0-9\\/]*)<\\/div>'
    },
    'yellow' : {
        'state': 'yellow',
        'name': 'Yellow',
        'inklvl_rx':  "IMAGE\\/Ink_Y\\.PNG\\' height=\\'([0-9]{1,2})\\'",
        'cartridge_rx': '\\(Y\\)&nbsp;\\:<\\/span><\\/dt><dd class="value clearfix\\"><div class=\\"preserve-white-space\\">([a-zA-Z0-9\\/]*)<\\/div>'
    },
    'black' : {
        'state': 'black',
        'name': 'Black',
        'inklvl_rx':  "IMAGE\\/Ink_K\\.PNG\\' height=\\'([0-9]{1,2})\\'",
        'cartridge_rx': '\\(BK\\)&nbsp;\\:<\\/span><\\/dt><dd class=\\"value clearfix\\"><div class=\\"preserve-white-space\\">([a-zA-Z0-9\\/]*)<\\/div>'
    },
    'magenta' : {
        'state': 'magenta',
        'name': 'Magenta',
        'inklvl_rx':  "IMAGE\\/Ink_M\\.PNG\\' height=\\'([0-9]{1,2})\\'",
        'cartridge_rx': '\\(M\\)&nbsp;\\:<\\/span><\\/dt><dd class=\\"value clearfix\\"><div class=\\"preserve-white-space\\">([a-zA-Z0-9\\/]*)<\\/div>'
    }
};

function readSettings() {
    //check if IP is entered in settings

    if (!adapter.config.printerip) {
        adapter.log.warn('No IP adress of printer set up. Adapter will be stopped.');
    }
    else { // ip entered
        ip = (adapter.config.printerport.length > 0) ? adapter.config.printerip + ':' + adapter.config.printerport : adapter.config.printerip; // if port is set then ip+port else ip only
        adapter.log.debug('IP: ' + ip);

        //check if sync time is entered in settings
        sync = (!adapter.config.synctime) ? 10 : parseInt(adapter.config.synctime,10);
        adapter.log.debug('ioBroker reads printer every ' + sync + ' minutes');

    } // end ip entered
}

async function readPrinterStatus() {
    // Check if unload triggerted
    if (isUnloaded) {
        return;
    }

    const link = 'http://' + ip + '/PRESENTATION/ADVANCED/INFO_PRTINFO/TOP';

    const resp = await axios.get(link);
    if (resp.status === 200) {
        adapter.setState('info.ip', {
            val: ip,
            ack: true
        });

        let match, rx;
        // MAC ADRESSE EINLESEN
        rx = new RegExp( /(?:MAC-Adresse|Printer Name|Adresse MAC Wi-Fi\/R.seau|Indirizzo MAC Wi-Fi\/rete|Dirección MAC de Wi-Fi\/Red|Endereço MAC de Wi-Fi\/Rede)&nbsp;:<\/span><\/dt><dd class=\"value clearfix\"><div class=\"preserve-white-space\">([a-zA-Z0-9:]*)<\/div>/g );
        let mac_string;
        while((match = rx.exec(resp.data)) != null) {
            mac_string = match[1];
        }
        adapter.log.debug('mac_string: ' + mac_string);
        adapter.setState('info.mac', {val: mac_string, ack: true});

        // read firmware version
        rx = new RegExp( /(?:Firmware.*)&nbsp;:<\/span><\/dt><dd class=\"value clearfix\"><div class=\"preserve-white-space\">([a-zA-Z0-9 äöüÄÖÜ\-\_\.]*)<\/div>/g );
        let firmware_string;
        while((match = rx.exec(resp.data)) != null) {
            firmware_string = match[1];
        }
        adapter.log.debug('firmware_string: ' + firmware_string);
        adapter.setState('info.firmware', {val: firmware_string, ack: true});

        // read serial number
        rx = new RegExp( /(?:Seriennummer|Serial Number|Numéro de série|Numero di serie|Número de serie|Número de série)&nbsp;:<\/span><\/dt><dd class=\"value clearfix\"><div class=\"preserve-white-space\">([a-zA-Z0-9]*)<\/div>/g );
        let serial_string;
        while((match = rx.exec(resp.data)) != null) {
            serial_string = match[1];
        }
        adapter.log.debug('serial_string: ' + serial_string);
        adapter.setState('info.serial', {val: serial_string, ack: true});

        for (const i in ink) {
            await adapter.setObjectNotExists(`inks.${ink[i].state}`, {
                type: 'state',
                common: {
                    role: 'level.volume',
                    name: 'Level of ' + ink[i].name,
                    desc: 'Level of ' + ink[i].name,
                    type: 'number',
                    unit: '%',
                    read: true,
                    write: false
                },
                native: {}
            });

            // read levels
            rx = new RegExp(ink[i].inklvl_rx, 'g');
            let level_string;
            while((match = rx.exec(resp.data)) != null) {
                level_string = match[1];
            }
            adapter.log.debug(ink[i].name + ' Levelstring: ' + level_string + 'px');
            const level = parseInt(level_string, 10) * 100 / baselevel;
            adapter.setState(`inks.${ink[i].state}`, {val: level, ack: true});
            adapter.log.debug(ink[i].name + ' Level: ' + level + '%');
        } // end for

        adapter.log.debug('Channels and states created/read');

    } else {
        adapter.log.warn('Cannot connect to Printer:');
    }
    adapter.log.debug('finished reading printer status data');
}

async function readPrinterNetwork() {
    // Check if unload triggerted
    if (isUnloaded) {
        return;
    }

    const link = 'http://' + ip + '/PRESENTATION/ADVANCED/INFO_NWINFO/TOP';

    const resp = await axios.get(link);
    if (resp.status === 200) {

        adapter.setState('info.ip', {
            val: ip,
            ack: true
        });

        let match, rx, name_string, model_string;
        // NAME EINLESEN
        rx = new RegExp( /(?:Gerätename)&nbsp;:<\/span><\/dt><dd class=\"value clearfix\"><div class=\"preserve-white-space\">([a-zA-Z0-9 äöüÄÖÜ\-\_]*)<\/div>/g );
        while((match = rx.exec(resp.data)) != null) {
            name_string = match[1];
        }
        adapter.log.debug('name_string: ' + name_string);
        adapter.setState('info.name', {val: name_string, ack: true});

        // MODELL EINLESEN
        rx = new RegExp( /<title>([a-zA-Z0-9 äöüÄÖÜ\-\_]*)<\/title>/g );
        while((match = rx.exec(resp.data)) != null) {
            model_string = match[1];
        }
        adapter.log.debug('model_string: ' + model_string);
        adapter.setState('info.model', {val: model_string, ack: true});

        adapter.log.debug('Channels and states created/read');

    } else {
        adapter.log.warn('Cannot connect to Printer');
    }
    adapter.log.debug('finished reading printer network data');
}

async function readPrinterMaintenance() {
    // Check if unload triggerted
    if (isUnloaded) {
        return;
    }

    const link = 'http://' + ip + '/PRESENTATION/ADVANCED/INFO_MENTINFO/TOP';

    const resp = await axios.get(link);
    if (resp.status === 200) {

        adapter.setState('info.ip', {
            val: ip,
            ack: true
        });

        let match, rx, first_print_string, printed_pages_string;
        // ERSTDRUCKDATUM EINLESEN
        rx = new RegExp( /(?:Erstdruckdatum|First Printing Date|Date de première impression|Data prima stampa|Primera fecha de impresión|Data da primeira impressão)&nbsp;\:<\/span><\/dt><dd class=\"value clearfix\"><div class=\"preserve-white-space\">((\d\d\-\d\d\-\d\d\d\d)|(\d\d\d\d\-\d\d\-\d\d))<\/div>/g );
        while((match = rx.exec(resp.data)) != null) {
            first_print_string = match[1];
        }
        adapter.log.debug('first_print_string: ' + first_print_string);
        adapter.setState('info.first_print_date', {val: first_print_string, ack: true});

        // GESAMTZAHL SEITEN
        rx = new RegExp( /(?:Gesamtanzahl Seiten)&nbsp;\:<\/span><\/dt><dd class=\"value clearfix\"><div class=\"preserve-white-space\">(\d*)<\/div>/g );
        while((match = rx.exec(resp.data)) != null) {
            printed_pages_string = match[1];
        }
        adapter.log.debug('printed_pages_string: ' + printed_pages_string);
        const page_count = parseInt(printed_pages_string, 10);
        adapter.log.debug('page_count: ' + page_count);
        adapter.setState('info.page_count', {val: page_count, ack: true});


        adapter.log.debug('Channels and states created/read');

    } else {
        adapter.log.warn('Cannot connect to Printer');

    }
    adapter.log.debug('finished reading printer maintenance data');
}

function stopReadPrinter() {
    clearTimeout(callReadPrinter);
    adapter.setState('info.connection', false, true);
    adapter.log.info('Epson EcoTank ET-2750 adapter stopped');
}

async function main() {
    // Check if unload triggerted
    if (isUnloaded) {
        return;
    }

    try {
        adapter.log.debug('Request printer stats...');
        await readPrinterNetwork();
        await readPrinterStatus();
        await readPrinterMaintenance();
        adapter.setState('info.connection', true, true);
    } catch (err) {
        if (err.message.includes('EHOSTUNREACH')) {
            adapter.log.debug(`Printer offline, next try in ${sync} minutes...`);
        }
        else {
            adapter.log.error(JSON.stringify(err));
        }
        adapter.setState('info.connection', false, true);
    }
    callReadPrinter = setTimeout(main, sync * 1000 * 60);
}

// If started as allInOne/compact mode => return function to create instance
if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
}