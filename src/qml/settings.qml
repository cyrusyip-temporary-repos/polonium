import QtQuick 2.15
import QtQuick.Layouts 1.15
import org.kde.kwin 2.0
import org.kde.plasma.components 3.0 as PC3
import org.kde.plasma.core 2.0 as PlasmaCore

PlasmaCore.Dialog {
    id: settingsDialog;
    
    property var settings: ({
        // see engine enum
        engine: 0,
        // 0 - left side, 1 - right side, 2 - active
        insertionPoint: 1,
    })
    
    property var desktop: ({
        screen: 0,
        activity: "",
        desktop: 1,
    })
    
    property rect screenGeometry;
    x: (screenGeometry.x + screenGeometry.width / 2) - width / 2;
    y: (screenGeometry.y + screenGeometry.height / 2) - height / 2;

    type: PlasmaCore.Dialog.OnScreenDisplay
    flags: Qt.Popup | Qt.WindowStaysOnTopHint
    location: PlasmaCore.Types.Floating

    function setSettings(s) {
        this.settings.engine = s.engine;
        this.settings.insertionPoint = s.insertionPoint;
    }
    
    function show() {
        // update desktop
        this.desktop.screen = workspace.activeScreen;
        this.desktop.activity = workspace.currentActivity;
        this.desktop.desktop = workspace.currentDesktop;
        // update settings
        engine.currentIndex = this.settings.engine;
        insertionPoint.currentIndex = this.settings.insertionPoint;
        // Update current screen information
        this.screenGeometry = workspace.clientArea(KWin.FullScreenArea, workspace.activeScreen, workspace.currentDesktop);
        // Show the popup
        this.visible = true;
    }
    
    function hide() {
        this.visible = false;
    }
    
    signal saveSettingsInternal(settings: var, desktop: var);
    
    function saveSettings() {
        this.settings.engine = engine.currentIndex;
        this.settings.insertionPoint = insertionPoint.currentIndex;
        this.saveSettingsInternal(this.settings, this.desktop);
    }
    
    mainItem: ColumnLayout {
        id: main;
    
        Layout.alignment: Qt.AlignHCenter;
        
        RowLayout {
            Layout.fillWidth: true;
            spacing: 10;
            PC3.Label {
                text: "Engine:";
            }
            PC3.ComboBox {
                id: engine;
                model: ["Binary Tree", "Half", "Three Column", "Monocle", "KWin"];
            }
        }
        
        RowLayout {
            Layout.fillWidth: true;
            spacing: 10;
            PC3.Label {
                text: "Insertion Point:";
            }
            PC3.ComboBox {
                id: insertionPoint;
                model: ["Left", "Right", "Selected"];
            }
        }
        
        RowLayout {
            PC3.Button {
                text: "Save and close";
                onClicked: {
                    settingsDialog.saveSettings();
                    settingsDialog.hide();
                }
            }
            PC3.Button {
                text: "Close without saving";
                onClicked: {
                    settingsDialog.hide();
                }
            }
        }
    }
}
