// driver/driver.ts - Mapping from engines to Kwin API

import { DriverManager } from "./";
import { TilingEngine, Tile, Client, EngineCapability } from "../engine";
import { Direction } from "../util/geometry";
import { EngineType } from "../engine/factory";
import { GSize, GPoint, DirectionTools } from "../util/geometry";
import { InsertionPoint } from "../util/config";
import * as Kwin from "../extern/kwin";
import BiMap from "mnemonist/bi-map";
import Queue from "mnemonist/queue";
import Log from "../util/log";
import Config from "../util/config";

export class TilingDriver
{
    engine: TilingEngine;
    engineType: EngineType;
    manager: DriverManager;
    
    tiles: BiMap<Kwin.Tile, Tile> = new BiMap();
    clients: BiMap<Kwin.Client, Client> = new BiMap();
    clientsToNull: Kwin.Client[] = [];
    
    constructor(engine: TilingEngine, engineType: EngineType, manager: DriverManager)
    {
        this.engine = engine;
        this.engineType = engineType;
        this.manager = manager;
    }
    
    switchEngine(engine: TilingEngine, engineType: EngineType)
    {
        this.engine = engine;
        this.engineType = engineType;
        try
        {
            for (const client of this.clients.values())
            {
                this.engine.addClient(client);
            }
            this.engine.buildLayout();
        }
        catch (e)
        {
            throw e;
        }
    }
    
    buildLayout(rootTile: Kwin.RootTile): void
    {
        const rootTileSize = rootTile.absoluteGeometry;
        // clear root tile
        while (rootTile.tiles.length > 0)
        {
            rootTile.tiles[0].remove();
        }
        this.tiles.clear();
        
        // set clients marked for untiling to null tiles
        for (const client of this.clientsToNull)
        {
            client.tile = null;
        }
        this.clientsToNull = [];
        
        // for maximizing single, sometimes engines can create overlapping root tiles so find the real root
        let realRootTile: Tile = this.engine.rootTile;
        while (realRootTile.tiles.length == 1 && realRootTile.client == null)
        {
            realRootTile = realRootTile.tiles[0];
        }
        // if a root tile client exists, just maximize it. there shouldnt be one if roottile has children
        if (realRootTile.client != null && Config.maximizeSingle)
        {
            const kwinClient = this.clients.inverse.get(realRootTile.client);
            if (kwinClient == undefined)
            {
                return;
            }
            kwinClient.tile = null;
            kwinClient.isSingleMaximized = true;
            kwinClient.setMaximize(true, true);
            return;
        }
        const queue: Queue<Tile> = new Queue();
        queue.enqueue(realRootTile);
        this.tiles.set(rootTile, realRootTile);

        while (queue.size > 0)
        {
            const tile = queue.dequeue()!;
            const kwinTile = this.tiles.inverse.get(tile)!;
            kwinTile.managed = true;
            kwinTile.layoutDirection = tile.layoutDirection;
            
            // 1 is vertical, 2 is horizontal
            const horizontal = (kwinTile.layoutDirection == 1);
            const tilesLen = tile.tiles.length;
            if (tilesLen > 1)
            {
                for (let i = 0; i < tilesLen; i += 1)
                {
                    // tiling has weird splitting mechanics, so hopefully this code can help with that
                    if (i == 0)
                    {
                        kwinTile.split(tile.layoutDirection);
                    }
                    else if (i > 1)
                    {
                        kwinTile.tiles[i-1].split(tile.layoutDirection);
                    }
                    if (horizontal && i > 0)
                    {
                        kwinTile.tiles[i-1].relativeGeometry.width = kwinTile.relativeGeometry.width / tilesLen;
                    }
                    else if (i > 0)
                    {
                        kwinTile.tiles[i-1].relativeGeometry.height = kwinTile.relativeGeometry.height / tilesLen;
                    }
                    // evenly distribute tile sizes before doing custom resizing
                    this.tiles.set(kwinTile.tiles[i], tile.tiles[i]);
                    queue.enqueue(tile.tiles[i]);
                }
            }
            // if there is one child tile, replace this tile with the child tile
            else if (tilesLen == 1)
            {
                this.tiles.set(kwinTile, tile.tiles[0]);
                queue.enqueue(tile.tiles[0]);
            }
            // grow to preferred tile size if necessary
            const tileSize = new GSize(kwinTile.absoluteGeometry);
            if (tile.requestedSize != null)
            {
                tileSize.fitSize(tile.requestedSize);
            }
            if (tile.client != null)
            {
                const kwinClient = this.clients.inverse.get(tile.client);
                if (kwinClient == undefined)
                {
                    Log.error("Client", tile.client.name, "does not exist");
                    return;
                }
                tileSize.fitSize(kwinClient.minSize);
                // set some properties before setting tile to make sure client shows up
                kwinClient.minimized = false;
                kwinClient.fullScreen = false;
                if (kwinClient.maximized)
                {
                    kwinClient.setMaximize(false, false);
                }
                kwinClient.tile = kwinTile;
                kwinClient.lastTiledLocation = GPoint.centerOfRect(kwinTile.absoluteGeometry);
            }
            // absolutegeometry is read only, so make sizing relative
            tileSize.height /= rootTileSize.height;
            tileSize.width /= rootTileSize.width;
            if (tileSize.area != 0)
            {
                tileSize.write(kwinTile.relativeGeometry);
            }
        }

        // bubble up tile size fixing (didn't want to overbloat this function)
        //this.fixSizing(realRootTile, rootTile);
    }

    /*private fixSizing(rootTile: Tile, kwinRootTile: Kwin.RootTile): void
    {
        // works by first doing a breadth first search to establish depth layers of windows
        // next, bubbles up each depth layer, adding the sizes from the previous depth layer and establishing ratios
        // should be satisfactory for most use cases as window size conflicts are somewhat rare
        let layers: Queue<Tile[]> = new Queue();
        let stack: Tile[] = [rootTile];
        let stackNext: Tile[] = [];
        while (stack.length != 0)
        {
            for (const tile of stack)
            {
                for (const child of tile.tiles)
                {
                    stackNext.push(child);
                }
            }
            layers.enqueue(stack);
            stack = stackNext;
        }
        let sizeMap: Map<Tile, GSize> = new Map();
        while (layers.size > 0)
        {
            let layer = layers.dequeue()!;
            for (const tile of layer)
            {
                if (tile.client != null)
                {
                    const kwinClient = this.clients.inverse.get(tile.client)!.minSize;
                }
            }
        }
        for (const tile of sizeMap.keys())
        {
            sizeMap.get(tile)!.write(tile.absoluteGeometry);
        }
    }*/

    addClient(kwinClient: Kwin.Client): void
    {
        if (this.clients.has(kwinClient))
        {
            return;
        }
        const client = new Client(kwinClient);
        this.clients.set(kwinClient, client);
        
        // tries to use active insertion if it should, but can fail and fall back
        let failedActive: boolean = true;
        activeChecks: if (this.engine.config.insertionPoint == InsertionPoint.Active)
        {
            failedActive = false;
            const activeClient = this.manager.ctrl.workspace.activeClient;
            if (activeClient == null || activeClient.tile == null)
            {
                failedActive = true;
                break activeChecks;
            }
            const tile = this.tiles.get(activeClient.tile);
            if (tile == undefined)
            {
                failedActive = true;
                break activeChecks;
            }
            this.engine.putClientInTile(client, tile);
        }
        try
        {
            if (failedActive)
            {
                this.engine.addClient(client);
            }
            this.engine.buildLayout();
        }
        catch (e)
        {
            Log.error(e);
        }
    }
    
    removeClient(kwinClient: Kwin.Client): void
    {
        const client = this.clients.get(kwinClient);
        if (client == undefined)
        {
            return;
        }
        this.clients.delete(kwinClient);
        this.clientsToNull.push(kwinClient);
        try
        {
            this.engine.removeClient(client);
            this.engine.buildLayout();
        }
        catch (e)
        {
            Log.error(e);
        }
    }
    
    putClientInTile(kwinClient: Kwin.Client, kwinTile: Kwin.Tile, direction?: Direction)
    {
        const tile = this.tiles.get(kwinTile);
        if (tile == undefined)
        {
            Log.error("Tile", kwinTile.absoluteGeometry, "not registered");
            return;
        }
        if (!this.clients.has(kwinClient))
        {
            this.clients.set(kwinClient, new Client(kwinClient));
        }
        const client = this.clients.get(kwinClient)!;
        try
        {
            let rotatedDirection = direction;
            if (rotatedDirection != null
                && this.engine.config.rotateLayout
                && this.engine.engineCapability & EngineCapability.TranslateRotation)
            {
                rotatedDirection = new DirectionTools(rotatedDirection).rotateCw();
                Log.debug("Insertion direction rotated to", rotatedDirection);
            }
            this.engine.putClientInTile(client, tile, rotatedDirection);
            this.engine.buildLayout();
        }
        catch (e)
        {
            Log.error(e);
        }
    }
    
    regenerateLayout(rootTile: Kwin.RootTile)
    {
        const queue: Queue<Kwin.Tile> = new Queue();
        queue.enqueue(rootTile);
        while (queue.size > 0)
        {
            const kwinTile = queue.dequeue()!;
            const tile = this.tiles.get(kwinTile);
            if (tile == undefined)
            {
                Log.error("Tile", kwinTile.absoluteGeometry, "not registered");
                continue;
            }
            tile.requestedSize = GSize.fromRect(kwinTile.absoluteGeometry);
            for (const tile of kwinTile.tiles)
            {
                queue.enqueue(tile);
            }
        }
        try
        {
            this.engine.regenerateLayout();
            this.engine.buildLayout();            
        }
        catch (e)
        {
            Log.error(e);
        }
    }
}
