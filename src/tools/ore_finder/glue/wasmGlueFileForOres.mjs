// Browser-compatible glue for orefinder.gg wasm
// IMPORTANT: Place ores.wasm where your bundler serves it, e.g. public/wasm/ores.wasm
// and adjust this path if needed.
var E = "/wasm/ores.wasm";

// Patched loader: data: URLs unchanged, http(s) and relative paths via fetch
async function k(e = {}, _) {
  let t;

  if (_.startsWith("data:")) {
    const o = _.replace(/^data:.*?base64,/, "");
    let n;
    if (typeof Buffer == "function" && typeof Buffer.from == "function") {
      // Node or environments with Buffer
      n = Buffer.from(o, "base64");
    } else if (typeof atob == "function") {
      // Browser base64 decode
      const g = atob(o);
      n = new Uint8Array(g.length);
      for (let s = 0; s < g.length; s++) n[s] = g.charCodeAt(s);
    } else {
      throw new Error("Cannot decode base64-encoded data URL");
    }
    t = await WebAssembly.instantiate(n, e);

  } else {
    // Browser path / URL: use fetch
    const globalScope = (typeof window !== "undefined" ? window : self);
    const url = new URL(_, globalScope.location.origin);


    const o = await fetch(url.toString());
    const n = o.headers.get("Content-Type") || "";
    if ("instantiateStreaming" in WebAssembly && n.startsWith("application/wasm")) {
      t = await WebAssembly.instantiateStreaming(o, e);
    } else {
      const g = await o.arrayBuffer();
      t = await WebAssembly.instantiate(g, e);
    }
  }

  return t.instance.exports;
}

let r;

function R(e) {
  r = e;
}
const b = new Array(128).fill(void 0);
b.push(void 0, null, !0, !1);

function u(e) {
  return b[e];
}
let f = b.length;

function $(e) {
  e < 132 || (b[e] = f, f = e);
}

function a(e) {
  const _ = u(e);
  return $(e), _;
}

function l(e) {
  f === b.length && b.push(b.length + 1);
  const _ = f;
  return (f = b[_]), (b[_] = e), _;
}

// TextDecoder/TextEncoder: in browsers, global TextDecoder/TextEncoder exist.
// The Node fallback `(0, module.require)("util")` is NOT valid in browser, so remove it.
const B = TextDecoder;
let S = new B("utf-8", {
  ignoreBOM: !0,
  fatal: !0,
});
S.decode();
let z = null;

function p() {
  return (z === null || z.byteLength === 0) && (z = new Uint8Array(r.memory.buffer)), z;
}

function W(e, _) {
  return (e = e >>> 0), S.decode(p().subarray(e, e + _));
}

function j(e) {
  const _ = typeof e;
  if (_ == "number" || _ == "boolean" || e == null) return `${e}`;
  if (_ == "string") return `"${e}"`;
  if (_ == "symbol") {
    const n = e.description;
    return n == null ? "Symbol" : `Symbol(${n})`;
  }
  if (_ == "function") {
    const n = e.name;
    return typeof n == "string" && n.length > 0 ? `Function(${n})` : "Function";
  }
  if (Array.isArray(e)) {
    const n = e.length;
    let g = "[";
    n > 0 && (g += j(e[0]));
    for (let s = 1; s < n; s++) g += ", " + j(e[s]);
    return (g += "]"), g;
  }
  const t = /\[object ([^\]]+)\]/.exec(toString.call(e));
  let o;
  if (t.length > 1) o = t[1];
  else return toString.call(e);
  if (o == "Object")
    try {
      return "Object(" + JSON.stringify(e) + ")";
    } catch {
      return "Object";
    }
  return e instanceof Error
    ? `${e.name}: ${e.message}
${e.stack}`
    : o;
}
let O = 0;

// TextEncoder: in browsers, global TextEncoder exists; remove Node fallback.
const D = TextEncoder;
let m = new D("utf-8");
const M =
  typeof m.encodeInto == "function"
    ? function (e, _) {
        return m.encodeInto(e, _);
      }
    : function (e, _) {
        const t = m.encode(e);
        return _.set(t), { read: e.length, written: t.length };
      };

function U(e, _, t) {
  if (t === void 0) {
    const w = m.encode(e),
      d = _(w.length, 1) >>> 0;
    return p().subarray(d, d + w.length).set(w), (O = w.length), d;
  }
  let o = e.length,
    n = _(o, 1) >>> 0;
  const g = p();
  let s = 0;
  for (; s < o; s++) {
    const w = e.charCodeAt(s);
    if (w > 127) break;
    g[n + s] = w;
  }
  if (s !== o) {
    s !== 0 && (e = e.slice(s)), (n = t(n, o, (o = s + e.length * 3), 1) >>> 0);
    const w = p().subarray(n + s, n + o),
      d = M(e, w);
    (s += d.written), (n = t(n, o, s, 1) >>> 0);
  }
  return (O = s), n;
}
let c = null;

function y() {
  return (c === null || c.buffer.detached === !0 || (c.buffer.detached === void 0 && c.buffer !== r.memory.buffer)) && (c = new DataView(r.memory.buffer)), c;
}

function A(e, _) {
  if (!(e instanceof _)) throw new Error(`expected instance of ${_.name}`);
  return e.ptr;
}

function h(e) {
  return e == null;
}
const A_ = Object.freeze({
    Java: 1,
    1: "Java",
    Bedrock: 2,
    2: "Bedrock",
  }),
  F_ = Object.freeze({
    V1_7: 10070,
    10070: "V1_7",
    V1_8: 10080,
    10080: "V1_8",
    V1_9: 10090,
    10090: "V1_9",
    V1_10: 10100,
    10100: "V1_10",
    V1_11: 10110,
    10110: "V1_11",
    V1_12: 10120,
    10120: "V1_12",
    V1_13: 10130,
    10130: "V1_13",
    V1_14: 10140,
    10140: "V1_14",
    V1_15: 10150,
    10150: "V1_15",
    V1_16: 10160,
    10160: "V1_16",
    V1_17: 10170,
    10170: "V1_17",
    V1_18: 10180,
    10180: "V1_18",
    V1_19: 10190,
    10190: "V1_19",
    V1_19_3: 10193,
    10193: "V1_19_3",
    V1_20: 10200,
    10200: "V1_20",
    V1_20_2: 10202,
    10202: "V1_20_2",
    V1_20_30: 10203,
    10203: "V1_20_30",
    V_1_20_60: 10206,
    10206: "V_1_20_60",
    V1_21: 10210,
    10210: "V1_21",
    V1_21_2: 10212,
    10212: "V1_21_2",
    V1_21_40_V1_21_4: 10214,
    10214: "V1_21_40_V1_21_4",
    V1_21_50_V1_21_5: 10215,
    10215: "V1_21_50_V1_21_5",
    V1_21_60_V1_21_6: 10216,
    10216: "V1_21_60_V1_21_6",
    V1_21_70: 10217,
    10217: "V1_21_70",
    V1_21_80: 10218,
    10218: "V1_21_80",
  }),
  F =
    typeof FinalizationRegistry > "u"
      ? {
          register: () => {},
          unregister: () => {},
        }
      : new FinalizationRegistry((e) => r.__wbg_orefinder_free(e >>> 0, 1));
class T_ {
  __destroy_into_raw() {
    const _ = this.__wbg_ptr;
    return (this.__wbg_ptr = 0), F.unregister(this), _;
  }
  free() {
    const _ = this.__destroy_into_raw();
    r.__wbg_orefinder_free(_, 0);
  }
  constructor(_, t) {
    A(_, v);
    var o = _.__destroy_into_raw();
    const n = r.orefinder_new(o, t);
    return (this.__wbg_ptr = n >>> 0), F.register(this, this.__wbg_ptr, this), this;
  }
  find(_) {
    A(_, V);
    var t = _.__destroy_into_raw();
    const o = r.orefinder_find(this.__wbg_ptr, t);
    return a(o);
  }
}
const T =
  typeof FinalizationRegistry > "u"
    ? {
        register: () => {},
        unregister: () => {},
      }
    : new FinalizationRegistry((e) => r.__wbg_world_free(e >>> 0, 1));
class v {
  __destroy_into_raw() {
    const _ = this.__wbg_ptr;
    return (this.__wbg_ptr = 0), T.unregister(this), _;
  }
  free() {
    const _ = this.__destroy_into_raw();
    r.__wbg_world_free(_, 0);
  }
  get edition() {
    return r.__wbg_get_world_edition(this.__wbg_ptr);
  }
  set edition(_) {
    r.__wbg_set_world_edition(this.__wbg_ptr, _);
  }
  get version() {
    return r.__wbg_get_world_version(this.__wbg_ptr);
  }
  set version(_) {
    r.__wbg_set_world_version(this.__wbg_ptr, _);
  }
  get biome_size() {
    try {
      const o = r.__wbindgen_add_to_stack_pointer(-16);
      r.__wbg_get_world_biome_size(o, this.__wbg_ptr);
      var _ = y().getInt32(o + 4 * 0, !0),
        t = y().getInt32(o + 4 * 1, !0);
      return _ === 0 ? void 0 : t;
    } finally {
      r.__wbindgen_add_to_stack_pointer(16);
    }
  }
  set biome_size(_) {
    r.__wbg_set_world_biome_size(this.__wbg_ptr, !h(_), h(_) ? 0 : _);
  }
  get large_biomes() {
    return r.__wbg_get_world_large_biomes(this.__wbg_ptr) !== 0;
  }
  set large_biomes(_) {
    r.__wbg_set_world_large_biomes(this.__wbg_ptr, _);
  }
  constructor(_, t, o, n, g, s) {
    const w = r.world_new(_, t, o, n, !h(g), h(g) ? 0 : g, s);
    return (this.__wbg_ptr = w >>> 0), T.register(this, this.__wbg_ptr, this), this;
  }
}
const x =
  typeof FinalizationRegistry > "u"
    ? {
        register: () => {},
        unregister: () => {},
      }
    : new FinalizationRegistry((e) => r.__wbg_zone_free(e >>> 0, 1));
class V {
  static __wrap(_) {
    _ = _ >>> 0;
    const t = Object.create(V.prototype);
    return (t.__wbg_ptr = _), x.register(t, t.__wbg_ptr, t), t;
  }
  __destroy_into_raw() {
    const _ = this.__wbg_ptr;
    return (this.__wbg_ptr = 0), x.unregister(this), _;
  }
  free() {
    const _ = this.__destroy_into_raw();
    r.__wbg_zone_free(_, 0);
  }
  get x() {
    return r.__wbg_get_zone_x(this.__wbg_ptr);
  }
  set x(_) {
    r.__wbg_set_zone_x(this.__wbg_ptr, _);
  }
  get z() {
    return r.__wbg_get_zone_z(this.__wbg_ptr);
  }
  set z(_) {
    r.__wbg_set_zone_z(this.__wbg_ptr, _);
  }
  get size_x() {
    return r.__wbg_get_zone_size_x(this.__wbg_ptr);
  }
  set size_x(_) {
    r.__wbg_set_zone_size_x(this.__wbg_ptr, _);
  }
  get size_z() {
    return r.__wbg_get_zone_size_z(this.__wbg_ptr);
  }
  set size_z(_) {
    r.__wbg_set_zone_size_z(this.__wbg_ptr, _);
  }
  constructor(_, t, o, n) {
    const g = r.zone_new(_, t, o, n);
    return (this.__wbg_ptr = g >>> 0), x.register(this, this.__wbg_ptr, this), this;
  }
  extend(_, t, o, n) {
    const g = r.zone_extend(this.__wbg_ptr, _, t, o, n);
    return V.__wrap(g);
  }
  contains(_, t) {
    return r.zone_contains(this.__wbg_ptr, _, t) !== 0;
  }
}

function C(e) {
  a(e);
}

function I(e) {
  return l(e);
}

function L(e) {
  const _ = u(e);
  return l(_);
}

function N(e, _) {
  const t = W(e, _);
  return l(t);
}

function J(e, _, t) {
  u(e)[a(_)] = a(t);
}

function q() {
  const e = new Array();
  return l(e);
}

function H() {
  const e = new Object();
  return l(e);
}

function Y(e, _, t) {
  u(e)[_ >>> 0] = a(t);
}

function G(e, _) {
  const t = j(u(_)),
    o = U(t, r.__wbindgen_malloc, r.__wbindgen_realloc),
    n = O;
  y().setInt32(e + 4 * 1, n, !0), y().setInt32(e + 4 * 0, o, !0);
}

function K(e, _) {
  throw new Error(W(e, _));
}

// Browser: URL is already global on window. Ensure it exists.
if (typeof URL === "undefined" && typeof globalThis !== "undefined") {
  // eslint-disable-next-line no-global-assign
  URL = globalThis.URL;
}

const i = await k(
    {
      "./rust_bg.js": {
        __wbindgen_object_drop_ref: C,
        __wbindgen_number_new: I,
        __wbindgen_object_clone_ref: L,
        __wbindgen_string_new: N,
        __wbg_set_9182712abebf82ef: J,
        __wbg_new_034f913e7636e987: q,
        __wbg_new_e69b5f66fda8f13c: H,
        __wbg_set_425e70f7c64ac962: Y,
        __wbindgen_debug_string: G,
        __wbindgen_throw: K,
      },
    },
    E // "/wasm/ores.wasm"
  ),
  P = i.memory,
  Q = i.__wbg_zone_free,
  X = i.__wbg_get_zone_x,
  Z = i.__wbg_set_zone_x,
  __ = i.__wbg_get_zone_z,
  e_ = i.__wbg_set_zone_z,
  t_ = i.__wbg_get_zone_size_x,
  n_ = i.__wbg_set_zone_size_x,
  r_ = i.__wbg_get_zone_size_z,
  o_ = i.__wbg_set_zone_size_z,
  i_ = i.zone_new,
  s_ = i.zone_extend,
  g_ = i.zone_contains,
  w_ = i.__wbg_orefinder_free,
  b_ = i.orefinder_new,
  c_ = i.orefinder_find,
  d_ = i.__wbg_world_free,
  f_ = i.__wbg_get_world_edition,
  a_ = i.__wbg_set_world_edition,
  u_ = i.__wbg_get_world_version,
  l_ = i.__wbg_set_world_version,
  z_ = i.__wbg_get_world_biome_size,
  h_ = i.__wbg_set_world_biome_size,
  p_ = i.__wbg_get_world_large_biomes,
  m_ = i.__wbg_set_world_large_biomes,
  y_ = i.world_new,
  V_ = i.__wbindgen_malloc,
  x_ = i.__wbindgen_realloc,
  j_ = i.__wbindgen_add_to_stack_pointer;
var O_ = Object.freeze({
  __proto__: null,
  __wbg_get_world_biome_size: z_,
  __wbg_get_world_edition: f_,
  __wbg_get_world_large_biomes: p_,
  __wbg_get_world_version: u_,
  __wbg_get_zone_size_x: t_,
  __wbg_get_zone_size_z: r_,
  __wbg_get_zone_x: X,
  __wbg_get_zone_z: __,
  __wbg_orefinder_free: w_,
  __wbg_set_world_biome_size: h_,
  __wbg_set_world_edition: a_,
  __wbg_set_world_large_biomes: m_,
  __wbg_set_world_version: l_,
  __wbg_set_zone_size_x: n_,
  __wbg_set_zone_size_z: o_,
  __wbg_set_zone_x: Z,
  __wbg_set_zone_z: e_,
  __wbg_world_free: d_,
  __wbg_zone_free: Q,
  __wbindgen_add_to_stack_pointer: j_,
  __wbindgen_malloc: V_,
  __wbindgen_realloc: x_,
  memory: P,
  orefinder_find: c_,
  orefinder_new: b_,
  world_new: y_,
  zone_contains: g_,
  zone_extend: s_,
  zone_new: i_,
});
R(O_);

export {
  A_ as Edition,
  T_ as OreFinder,
  F_ as Version,
  v as World,
  V as Zone,
  q as __wbg_new_034f913e7636e987,
  H as __wbg_new_e69b5f66fda8f13c,
  Y as __wbg_set_425e70f7c64ac962,
  J as __wbg_set_9182712abebf82ef,
  R as __wbg_set_wasm,
  G as __wbindgen_debug_string,
  I as __wbindgen_number_new,
  L as __wbindgen_object_clone_ref,
  C as __wbindgen_object_drop_ref,
  N as __wbindgen_string_new,
  K as __wbindgen_throw,
};
