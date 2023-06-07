// normal kwin tiling
import copy from "fast-copy";
import { BiMap } from "mnemonist";
import { printDebug } from "../util";
import * as Engine from "./common";

// look familiar?
class Tile {
    tiles: Array<Tile> = new Array;
    windows: Array<KWin.AbstractClient> = new Array;
    // null for root tile
    relativeGeometry: Qt.QRect | null;
    parent: Tile | null;
    padding: number = 4;
    layoutDirection: number;
    constructor(parent: Tile | null, relativeGeometry: Qt.QRect | null, layoutDirection: number) {
        this.layoutDirection = layoutDirection;
        // rootTile
        if (parent == null || relativeGeometry == null) {
            this.parent = null;
            this.relativeGeometry = null;
            return;
        }
        this.parent = parent;
        this.relativeGeometry = relativeGeometry;
        parent.tiles.push(this);
    }
}
class RootTile extends Tile {
    parent: null = null;
    relativeGeometry: null = null;
    constructor(layoutDirection: number) {
        super(null, null, layoutDirection)
    }
}

export class TilingEngine implements Engine.TilingEngine {
    fakeRootTile: RootTile = new RootTile(1);
    untiledClients: Array<KWin.AbstractClient> = new Array;
    tileMap: BiMap<Tile, KWin.Tile> = new BiMap;
    buildLayout(rootTile: KWin.RootTile): boolean {
        this.tileMap.clear();
        this.tileMap.set(this.fakeRootTile, rootTile);
        let stack: Array<Tile> = [this.fakeRootTile];
        let stackNext = new Array<Tile>;
        while (stack.length != 0) {
            for (const fakeTile of stack) {
                const realTile = this.tileMap.get(fakeTile);
                if (realTile == undefined) {
                    printDebug("Could not find tile", true);
                    return false;
                }
                let splitTile = realTile;
                for (let i = 1; i < fakeTile.tiles.length; i += 1) {
                    splitTile.split(fakeTile.layoutDirection);
                    splitTile = realTile.tiles[i];
                }
                for (let i = 0; i < fakeTile.tiles.length; i += 1) {
                    this.tileMap.set(fakeTile.tiles[i], realTile.tiles[i]);
                    // have to set all properties individually for reasons
                    realTile.tiles[i].relativeGeometry.x = fakeTile.tiles[i].relativeGeometry!.x;
                    realTile.tiles[i].relativeGeometry.y = fakeTile.tiles[i].relativeGeometry!.y;
                    realTile.tiles[i].relativeGeometry.width = fakeTile.tiles[i].relativeGeometry!.width;
                    realTile.tiles[i].relativeGeometry.height = fakeTile.tiles[i].relativeGeometry!.height;
                    stackNext.push(fakeTile.tiles[i]);
                }
            }
            stack = stackNext;
            stackNext = [];
        }
        return true;
    }
    
    updateTiles(rootTile: KWin.RootTile): boolean {
        this.tileMap.clear();
        this.fakeRootTile = new RootTile(rootTile.layoutDirection);
        this.tileMap.set(this.fakeRootTile, rootTile);
        let stack: Array<KWin.Tile> = [rootTile];
        let stackNext = new Array<KWin.Tile>;
        while (stack.length != 0) {
            for (const realTile of stack) {
                const fakeTile = this.tileMap.inverse.get(realTile);
                if (fakeTile == undefined) {
                    printDebug("Could not find tile", true);
                    return false;
                }
                for (const tile of realTile.tiles) {
                    const newTile = new Tile(fakeTile, copy(tile.relativeGeometry), tile.layoutDirection);
                    this.tileMap.set(newTile, tile);
                    stackNext.push(tile);
                }
            }
            stack = stackNext;
            stackNext = [];
        }
        return true;
    }
    
    placeClients(): Array<[KWin.AbstractClient, KWin.Tile | null]> {
        let ret = new Array<[KWin.AbstractClient, KWin.Tile | null]>;
        let stack: Array<Tile> = [this.fakeRootTile];
        let stackNext = new Array<Tile>;
        while (stack.length != 0) {
            for (const fakeTile of stack) {
                if (!this.tileMap.has(fakeTile)) {
                    continue;
                }
                for (const client of fakeTile.windows) {
                    ret.push([client, this.tileMap.get(fakeTile)!]);
                }
                for (const tile of fakeTile.tiles) {
                    stackNext.push(tile);
                }
            }
            stack = stackNext;
            stackNext = [];
        }
        for (const client of this.untiledClients) {
            ret.push([client, null]);
        }
        return ret;
    }
    
    // user tiles this if they want
    addClient(client: KWin.AbstractClient): boolean {
        this.untiledClients.push(client);
        return true;
    }
    
    putClientInTile(client: KWin.AbstractClient, tile: KWin.Tile): boolean {
        const fakeTile = this.tileMap.inverse.get(tile);
        if (fakeTile == undefined) {
            printDebug("Could not find tile", true);
            return false;
        }
        fakeTile.windows.push(client);
        return true;
    }
    
    clientOfTile(tile: KWin.Tile): KWin.AbstractClient | null {
        if (this.tileMap.inverse.has(tile)) {
            const client = this.tileMap.inverse.get(tile)!.windows[0];
            if (client == undefined) {
                return null;
            } else {
                return client;
            }
        } else {
            return null;
        }
    }
    
    swapTiles(tileA: KWin.Tile, tileB: KWin.Tile): boolean {
        const fakeTileA = this.tileMap.inverse.get(tileA);
        const fakeTileB = this.tileMap.inverse.get(tileB);
        if (fakeTileA == undefined || fakeTileB == undefined) {
            printDebug("Could not find tiles", true);
            return false;
        }
        let tmparray = fakeTileA.windows;
        fakeTileA.windows = fakeTileB.windows;
        fakeTileB.windows = tmparray;
        return true;
    }
    
    removeClient(client: KWin.AbstractClient): boolean {
        if (this.untiledClients.includes(client)) {
            this.untiledClients.splice(this.untiledClients.indexOf(client), 1);
        }
        let stack: Array<Tile> = [this.fakeRootTile];
        let stackNext = new Array<Tile>;
        while (stack.length != 0) {
            for (const fakeTile of stack) {
                if (fakeTile.windows.includes(client)) {
                    fakeTile.windows.splice(fakeTile.windows.indexOf(client), 1);
                }
                for (const tile of fakeTile.tiles) {
                    stackNext.push(tile);
                }
            }
            stack = stackNext;
            stackNext = [];
        }
        return true;
    }
}