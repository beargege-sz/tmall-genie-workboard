import { JSON, JSONObject, JSONValue, JSONString } from "waft-json";
import { Page, Props, Target, MessageEvent, getDataSource, network, setTimeout, clearTimeout } from "waft";

export class Index extends Page {
  endpoint: string = "";
  photos: Array<string> = new Array<string>();
  photoStyles: Map<string, string> = new Map<string, string>();
  photoCaptions: Map<string, string> = new Map<string, string>();
  queue: Array<string> = new Array<string>();
  current: string = "";
  photoTimer: i32 = 0;
  refreshTimer: i32 = 0;
  clockTimer: i32 = 0;
  active: bool = false;
  randomState: u32 = 123456789;

  constructor(props: Props) {
    super(props);
    this.configure(getDataSource());
  }

  configure(data: JSONObject): void {
    if (data.has("snapshotUrl")) this.endpoint = data.getString("snapshotUrl");
  }

  twoDigits(value: i32): string { return value < 10 ? "0" + value.toString() : value.toString(); }

  updateClock(): void {
    clearTimeout(this.clockTimer);
    if (!this.active) return;
    const now = Date.now();
    const date = new Date(now + 8 * 60 * 60 * 1000);
    const state = new JSONObject();
    state.set("clockText", date.getUTCFullYear().toString() + "/" + this.twoDigits(date.getUTCMonth() + 1) + "/" + this.twoDigits(date.getUTCDate()) + "  " + this.twoDigits(date.getUTCHours()) + ":" + this.twoDigits(date.getUTCMinutes()));
    this.setState(state);
    this.clockTimer = setTimeout((data: JSONObject, target: Target | null): void => {
      (target as Index).updateClock();
    }, 60000 - now % 60000, this);
  }

  nextRandom(): f64 {
    this.randomState ^= this.randomState << 13;
    this.randomState ^= this.randomState >> 17;
    this.randomState ^= this.randomState << 5;
    return <f64>this.randomState / 4294967296.0;
  }

  setPhotoGeometry(state: JSONObject, style: string): void {
    const names: string[] = ["photoWidth", "photoHeight", "photoLeft", "photoTop"];
    const parts = style.split(";");
    for (let i = 0; i < names.length; i++) {
      let value = "0";
      if (i < parts.length) {
        const pair = parts[i].split(":");
        if (pair.length == 2) value = pair[1].replace("px", "");
      }
      state.set(names[i], value);
    }
  }

  extractSnapshot(value: JSONValue, depth: i32 = 0): JSONObject | null {
    if (depth > 4) return null;
    if (value instanceof JSONString) {
      const raw = (value as JSONString).stringValue().trim();
      if (raw.length > 1 && raw.charAt(0) == "{") return this.extractSnapshot(JSON.parseObject(raw), depth + 1);
      return null;
    }
    if (!(value instanceof JSONObject)) return null;
    const object = value as JSONObject;
    if (object.has("headline") && object.has("photos")) return object;
    const keys: string[] = ["response", "data", "body", "result", "dataSource"];
    for (let i = 0; i < keys.length; i++) {
      if (object.has(keys[i])) {
        const found = this.extractSnapshot(object.get(keys[i]), depth + 1);
        if (found !== null) return found;
      }
    }
    return null;
  }

  onLoad(query: JSONObject): void { this.start(); }

  onShow(): void { this.start(); }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.updateClock();
    this.randomState = <u32>Date.now() | 1;
    const data = getDataSource();
    this.configure(data);
    if (data.has("photoUrl")) this.current = data.getString("photoUrl");
    const initial = this.extractSnapshot(data);
    if (initial !== null) this.applySnapshot(initial);
    this.refresh();
    if (this.photos.length > 0 && this.photoTimer == 0) this.rotate();
  }

  onHide(): void {
    this.active = false;
    clearTimeout(this.photoTimer);
    clearTimeout(this.refreshTimer);
    clearTimeout(this.clockTimer);
  }

  onUnload(): void { this.onHide(); }

  applySnapshot(data: JSONObject): void {
    if (!data.has("headline") || !data.has("photos")) return;
    this.setState(data);
    const previous = this.photos.join("|");
    this.photos = new Array<string>();
    this.photoStyles = new Map<string, string>();
    this.photoCaptions = new Map<string, string>();
    const list = data.getArray("photos");
    for (let i = 0; i < list.length; i++) {
      const entry = list.arrayValue()[i] as JSONObject;
      this.photos.push(entry.getString("url"));
      this.photoCaptions.set(entry.getString("url"), entry.has("caption") ? entry.getString("caption") : "日期未记录 · 暂无照片说明");
      this.photoStyles.set(entry.getString("url"), entry.has("style") ? entry.getString("style") : "width:0px;height:0px;");
    }
    if (previous != this.photos.join("|")) this.queue = new Array<string>();
    if (this.photoStyles.has(this.current)) {
      const state = new JSONObject();
      state.set("photoUrl", this.current);
      state.set("photoStyle", this.photoStyles.get(this.current));
      state.set("photoStatus", this.photoCaptions.get(this.current));
      this.setPhotoGeometry(state, this.photoStyles.get(this.current));
      this.setState(state);
    }
    if (!this.photoStyles.has(this.current) && this.photos.length > 0) this.rotate();
  }

  onMessage(event: MessageEvent): void {
    if (event.data.has("dataSource")) this.configure(event.data.getObject("dataSource"));
    else this.configure(event.data);
    if (this.active) this.refresh();
  }

  onUpdate(data: JSONObject): void {
    const source = data.has("dataSource") ? data.getObject("dataSource") : data;
    this.configure(source);
    this.applySnapshot(source);
    if (this.active) this.refresh();
  }

  refresh(): void {
    clearTimeout(this.refreshTimer);
    if (!this.active) return;
    if (this.endpoint.length == 0) {
      const state = new JSONObject();
      state.set("status", "请从已绑定的 AI 看板技能打开页面");
      this.setState(state);
      return;
    }
    const params = new JSONObject();
    params.set("url", this.endpoint);
    params.set("method", "GET");
    network.request(params.toString(), (result: JSONObject, target: Target | null): void => {
      const page = target as Index;
      if (!page.active) return;
      const data = page.extractSnapshot(result);
      if (data !== null) {
        page.applySnapshot(data);
        return;
      }
      const state = new JSONObject();
      state.set("status", "连接暂不可用 · 保留上次快照，一分钟后重试");
      page.setState(state);
    }, this);
    this.refreshTimer = setTimeout((data: JSONObject, target: Target | null): void => {
      (target as Index).refresh();
    }, 60000, this);
  }

  rotate(): void {
    clearTimeout(this.photoTimer);
    if (!this.active || this.photos.length == 0) return;
    if (this.queue.length == 0) {
      this.queue = this.photos.slice(0);
      for (let i = this.queue.length - 1; i > 0; i--) {
        const j = <i32>Math.floor(this.nextRandom() * (i + 1));
        const value = this.queue[i];
        this.queue[i] = this.queue[j];
        this.queue[j] = value;
      }
      const last = this.queue.length - 1;
      if (last > 0 && this.queue[last] == this.current) {
        const value = this.queue[0];
        this.queue[0] = this.queue[last];
        this.queue[last] = value;
      }
    }
    this.current = this.queue.pop();
    const state = new JSONObject();
    state.set("photoUrl", this.current);
    state.set("photoStyle", this.photoStyles.has(this.current) ? this.photoStyles.get(this.current) : "width:0px;height:0px;");
    this.setPhotoGeometry(state, this.photoStyles.has(this.current) ? this.photoStyles.get(this.current) : "width:0px;height:0px;");
    state.set("photoStatus", this.photoCaptions.has(this.current) ? this.photoCaptions.get(this.current) : "日期未记录 · 暂无照片说明");
    this.setState(state);
    this.photoTimer = setTimeout((data: JSONObject, target: Target | null): void => {
      (target as Index).rotate();
    }, 180000 + <i64>(this.nextRandom() * 120000.0), this);
  }
}
