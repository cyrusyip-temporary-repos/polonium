// desktop.ts - Classes and interfaces relating to the desktop class

import { Output, QmlWorkspace, VirtualDesktop } from "kwin-api";

export interface StringDesktop {
    desktop: string; // VirtualDesktop.id
    activity: string;
    output: string; // Output.name
}

export class Desktop {
    public desktop: VirtualDesktop;
    public activity: string;
    public output: Output;

    public constructor(
        desktop: VirtualDesktop,
        activity: string,
        output: Output,
    ) {
        this.desktop = desktop;
        this.activity = activity;
        this.output = output;
    }

    public toRawDesktop(): StringDesktop {
        return {
            desktop: this.desktop.id,
            activity: this.activity,
            output: this.output.name,
        };
    }

    public toString(): string {
        return JSON.stringify(this.toRawDesktop());
    }
}

export class DesktopFactory {
    private workspace: QmlWorkspace;
    private desktopMap: Map<string, VirtualDesktop> = new Map();
    private outputMap: Map<string, Output> = new Map();

    public constructor(workspace: QmlWorkspace) {
        this.workspace = workspace;
        this.desktopsChanged();
        this.screensChanged();

        this.workspace.desktopsChanged.connect(this.desktopsChanged);
        this.workspace.screensChanged.connect(this.screensChanged);
    }

    private desktopsChanged(): void {
        this.desktopMap.clear();
        for (const desktop of this.workspace.desktops) {
            this.desktopMap.set(desktop.id, desktop);
        }
    }

    private screensChanged(): void {
        this.outputMap.clear();
        for (const output of this.workspace.screens) {
            this.outputMap.set(output.name, output);
        }
    }

    public createDesktop(
        desktop: VirtualDesktop,
        activity: string,
        output: Output,
    ): Desktop {
        return new Desktop(desktop, activity, output);
    }

    public createDefaultDesktop(): Desktop {
        return new Desktop(
            this.workspace.currentDesktop,
            this.workspace.currentActivity,
            this.workspace.activeScreen,
        );
    }

    public createDesktopFromStrings(desktop: StringDesktop): Desktop {
        const virtualDesktop = this.desktopMap.get(desktop.desktop);
        const output = this.outputMap.get(desktop.output);
        if (
            virtualDesktop == undefined ||
            output == undefined ||
            !this.workspace.activities.includes(desktop.activity)
        ) {
            throw new Error("Tried to create a desktop that does not exist!");
        }
        return new Desktop(virtualDesktop, desktop.activity, output);
    }
}
