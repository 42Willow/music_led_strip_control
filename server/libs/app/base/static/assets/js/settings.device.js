import Device from "./classes/Device.js";
import Toast from "./classes/Toast.js";

let output_types = {};
let devices = jinja_devices.map(d => { return new Device(d) });
let currentDevice = devices.find(d => d.id === localStorage.getItem("lastDevice"));
// Select first device if previously "All Devices" selected or localStorage is clear
currentDevice = currentDevice ? currentDevice : devices[0];
if (currentDevice) {
    $(`a[data-device_id=${currentDevice.id}`).removeClass("active");
}

// Get device id from url parameters
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('id')) {
    let passedId = urlParams.get('id');
    let selectedDeviceFromUrl = devices.find(device => device.id === passedId);
    if (selectedDeviceFromUrl !== undefined) {
        currentDevice = selectedDeviceFromUrl;
    }
}

if (currentDevice) {
    localStorage.setItem('lastDevice', currentDevice.id);
    $(`a[data-device_id=${currentDevice.id}`).addClass("active");
    $("#selected_device_txt").text(currentDevice.name);
}


// Init and load all settings
$(document).ready(function () {
    // Preload
    Promise.all([
        // get Output Types
        $.ajax("/api/resources/output-types").done((data) => {
            output_types = data;
            $('.output_type').each(function () {
                Object.keys(data).forEach(output_type_key => {
                    const option = new Option(data[output_type_key], output_type_key);
                    $(this).append(option);
                });
            });
        }),
        // get LED Strips
        $.ajax("/api/resources/led-strips").done((data) => {
            $('.led_strips').each(function () {
                for (let key in data) {
                    $(this).append(new Option(data[key], key));
                }
            });
        }),
    ]).then(response => {
        if (devices.length > 0) {
            $("#deviceFound").removeClass('d-none');
            $("#noDeviceFound").addClass('d-none');
            $("#selected_device_label").removeClass('d-none');
        } else {
            $("#deviceFound").addClass('d-none');
            $("#noDeviceFound").removeClass('d-none');
            $("#selected_device_label").addClass('d-none');
            return;
        }

        currentDevice.refreshConfig(output_types);
        // Add behavior to Device Tab
        devices.forEach(device => {
            device.link.addEventListener('click', () => {
                currentDevice = device;
                device.refreshConfig(output_types);
            });
        });

    }).catch((response) => {
        if (devices.length === 0) {
            return;
        }
        // all requests finished but one or more failed
        new Toast(JSON.stringify(response, null, '\t')).error();
    });

});

// Save Functions   -----------------------------------------------------------

function SetLocalSettings() {
    let settings_device = {};
    $(".device_setting_input").each((i, v) => {
        const setting_key = v.id;
        let setting_value = "";

        const element = $(`#${setting_key}.device_setting_input`);
        switch (element.attr("type")) {
            case "checkbox":
                setting_value = element.is(':checked');
                break;
            case "range":
            case "number":
                if (!element.val()) {
                    setting_value = 1;
                } else if (setting_key == "led_count" && element.val() < 7) {
                    // https://github.com/rpi-ws281x/rpi-ws281x-python/issues/70
                    setting_value = 7;
                } else {
                    setting_value = parseFloat(element.val());
                }
                break;
            case "option":
                let groups = [];
                element.children("span").each(function () {
                    groups.push($(this).attr('value'));
                });
                setting_value = groups;
                break;
            default:
                setting_value = element.val().trim();
                element.val(setting_value);
        }
        settings_device[setting_key] = setting_value;
    });
    const data = { "device": currentDevice.id, "settings": settings_device };

    const saveProgress = [
        $.ajax({
            url: "/api/settings/device",
            type: "POST",
            data: JSON.stringify(data, null, '\t'),
            contentType: 'application/json;charset=UTF-8'
        }).done((data) => {
            console.log("Device settings set successfully. Response:\n\n" + JSON.stringify(data, null, '\t'));
            currentDevice.name = data.settings.device_name;
            $("#selected_device_txt").text(data.settings.device_name);

            new Toast(`Device "${currentDevice.name}" saved.`).success();

        }).fail((data) => {
            console.log("Error while setting device settings. Error: " + data);
        })
    ];

    Object.keys(output_types).forEach(output_type_key => {
        const all_output_type_setting_keys = $("." + output_type_key).map(function () { return this.id }).toArray();
        let settings_output_type = {};

        Object.keys(all_output_type_setting_keys).forEach((setting_id) => {
            const setting_key = all_output_type_setting_keys[setting_id];
            let setting_value = "";

            const element = $(`#${setting_key}.${output_type_key}`);
            switch (element.attr("type")) {
                case "checkbox":
                    setting_value = element.is(':checked');
                    break;
                case "number":
                    setting_value = parseFloat(element.val());
                    break;
                default:
                    setting_value = element.val();
            }
            settings_output_type[setting_key] = setting_value;
        });

        const data2 = { "device": currentDevice.id, "output_type_key": output_type_key, "settings": settings_output_type };
        saveProgress.push(
            $.ajax({
                url: "/api/settings/device/output-type",
                type: "POST",
                data: JSON.stringify(data2, null, '\t'),
                contentType: 'application/json;charset=UTF-8'
            }).done(data => {
                console.log("Device settings set successfully. Response:\n\n" + JSON.stringify(data, null, '\t'));
            }).fail(data => {
                console.log("Error while setting device settings. Error: " + data);
            })
        );

    });

    Promise.all(saveProgress).then(response => {
        console.log("all saved", response);
    }).catch((response) => {
        new Toast(`Error while saving device "${currentDevice.name}". Error: ` + JSON.stringify(response, null, '\t')).error();
    });

}

const createDevice = function () {
    $.ajax({
        url: "/api/system/devices",
        type: "POST",
        contentType: 'application/json;charset=UTF-8'
    }).done(data => {
        console.log("New device created successfully. Response:\n\n" + JSON.stringify(data, null, '\t'));
        let newDeviceIndex = data["index"];
        // location.reload();
        $.ajax("/api/system/devices").done((data) => {
            const newDeviceId = data.find(d => d.id === `device_${newDeviceIndex}`);
            localStorage.setItem('lastDevice', newDeviceId.id);
            // parse data into device Objects
            devices = data.map(d => { return new Device(d) });

            // Select newly created Device by its index
            currentDevice = devices.find(d => d.id === `device_${newDeviceIndex}`);
            localStorage.setItem('lastDevice', currentDevice.id);

            // $(`a[data-device_id=${currentDevice.id}`).addClass("active");
            currentDevice.refreshConfig(output_types);

            reloadDeviceTab(devices);

            $("#selected_device_label").removeClass('d-none');
            $("#deviceFound").removeClass('d-none');
            $("#noDeviceFound").addClass('d-none');

            new Toast(`Device "${currentDevice.name}" created.`).success();

        })

    }).fail(data => {
        console.log("Error while creating new device. Error: " + data.responseText);
    });
}

// Do not allow special symbols except for [-_.] in device name
$('#device_name').on('input', function () {
    let position = this.selectionStart,
        regex = /[!$%^&*()+|~=`{}\[\]:";'<>?,\/]/gi,
        textVal = $(this).val();
    if (regex.test(textVal)) {
        $(this).val(textVal.replace(regex, ''));
        position--;
    }
    this.setSelectionRange(position, position);
});

// Add new group pill on "+" click
$("#add_device_group").on("click", function () {
    let deviceGroup = $("#device_group_dropdown").val();
    let exists = 0 != $(`#device_groups span[value="${deviceGroup}"]`).length;
    if (deviceGroup && !exists) {
        addGroupPill(deviceGroup);
        removeGroupOption(deviceGroup);
    }
});

// Remove group pill on "x" click
$("#device_groups").on("click", ".badge > span", function () {
    let group = $(this).parent().attr('value');
    addGroupOption(group);
    removeGroupPill(group);
});

$("#device_groups").on("mouseover mouseleave", ".badge > span", function (event) {
    event.preventDefault();
    $(this).parent().toggleClass("badge-primary");
    $(this).parent().toggleClass("badge-danger");
});

$("#save_btn").on("click", function () {
    // Do not save device settings if device name already exists
    let deviceNameExists = devices.some( device => $("#device_name").val() === device._name && currentDevice.id !== device.id );
    if (deviceNameExists) {
        new Toast(`Device "${$("#device_name").val()}" already exists.`).warning();
    } else {
        SetLocalSettings();
    }
});

$("#create1_btn, #create2_btn").on("click", function () {
    createDevice();
});

$("#delete_btn").on("click", function () {
    $('#modal_device_name').text(currentDevice.name);
    $('#modal_delete_device').modal('show');
})

$("#delete_btn_modal").on("click", function () {
    $('#modal_delete_device').modal('hide');
    $.ajax({
        url: "/api/system/devices",
        type: "DELETE",
        data: JSON.stringify({ "device": currentDevice.id }, null, '\t'),
        contentType: 'application/json;charset=UTF-8'
    }).done(data => {
        localStorage.removeItem('lastDevice');
        console.log("Device deleted successfully. Response:\n\n" + JSON.stringify(data, null, '\t'));

        new Toast(`Device "${currentDevice.name}" deleted.`).success();

        devices = $.grep(devices, function (e) {
            return e.id != data.device;
        });

        if (devices.length) {
            currentDevice = devices[[devices.length - 1]];
            localStorage.setItem('lastDevice', currentDevice.id);
            currentDevice.refreshConfig(output_types);
        } else {
            $("#deviceFound").addClass('d-none');
            $("#noDeviceFound").removeClass('d-none');
            $("#selected_device_label").addClass('d-none');
        }

        reloadDeviceTab(devices);

    }).fail(data => {
        new Toast(`Error while deleting device "${currentDevice.name}". Error: ${data.responseText}`).error();
    });
})

function reloadDeviceTab(devices) {
    // Remove every pill in the navigation and recreate
    const tabs = document.getElementById("deviceTabID");
    // tabs.innerHTML = `
    //     <li class="nav-item">
    //         <a class="nav-link">
    //             <span class="badge badge-secondary" id="">Devices</span>
    //         </a>
    //     </li>
    // `;
    tabs.innerHTML = "";

    // Build Device Tab
    devices.forEach(device => {
        device.getPill(currentDevice.id);

        device.link.addEventListener('click', () => {
            currentDevice = device;
            $("#selected_device_txt").text(currentDevice.name);
            device.refreshConfig(output_types);
        });

        const li = document.createElement("li");
        li.className = "nav-item device_item";
        li.appendChild(device.link);
        tabs.appendChild(li);
    });

    $('#device_count').text(devices.length);
    $("#selected_device_txt").text(currentDevice.name);
}

function addGroupPill(group) {
    const pill = `<span class="badge badge-primary badge-pill" value="${group}">${group} <span class="feather icon-x"></span></span> `;
    $("#device_groups").append(pill);
}

function removeGroupPill(group) {
    let groupPill = $(`#device_groups span[value="${group}"]`);
    groupPill.remove();
}

function addGroupOption(group) {
    const option = new Option(group, group);
    option.setAttribute('selected', 'selected');
    $("#device_group_dropdown").prepend(option);
}

function removeGroupOption(group) {
    let groupOption = $(`#device_group_dropdown option[value="${group}"]`);
    groupOption.remove();
}
