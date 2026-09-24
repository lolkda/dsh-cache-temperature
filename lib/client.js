window.__ModuleLoader__.load({id:"@local/dsh-cache-temperature",factory(require){const module={exports:{}};const exports=module.exports;
//#region rolldown:runtime
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion
let react = require("react");
react = __toESM(react);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = __toESM(react_jsx_runtime);

//#region src/client/locales.ts
/** Locale namespace owning every string the keepalive control renders. */
const KEEPALIVE_LOCALE_NAMESPACE = "cache-keepalive";
/** Complete shipped dictionaries for the keepalive namespace. */
const keepaliveDictionaries = {
	en: {
		compactLabel: "Keepalive",
		switchLabel: "Prompt cache keepalive",
		settingsLabel: "Keepalive settings",
		panelTitle: "Keepalive",
		hint: "Sends a minimal request so this session's prompt cache stays warm.",
		intervalLabel: "Refresh interval (minutes)",
		idleTimeoutLabel: "Idle window (minutes)",
		statusLoading: "Loading keepalive settings…",
		statusSaving: "Saving…",
		statusSaved: "Saved",
		statusConflict: "These settings changed elsewhere. Check the values and try again.",
		statusReadonly: "Read-only: this connection cannot store preferences.",
		statusUnavailable: "Keepalive settings are unavailable in this connection.",
		invalidDuration: "That is not a valid duration."
	},
	zh: {
		compactLabel: "保温",
		switchLabel: "提示缓存保温",
		settingsLabel: "保温设置",
		panelTitle: "保温",
		hint: "发送最小请求，让本会话的提示缓存保持温热。",
		intervalLabel: "刷新间隔（分钟）",
		idleTimeoutLabel: "空闲上限（分钟）",
		statusLoading: "正在读取保温设置…",
		statusSaving: "正在保存…",
		statusSaved: "已保存",
		statusConflict: "设置已在别处改动，请核对数值后重试。",
		statusReadonly: "只读：当前连接无法保存偏好设置。",
		statusUnavailable: "当前连接不支持保温设置。",
		invalidDuration: "这不是有效的时长。"
	}
};

//#endregion
//#region node_modules/.pnpm/@deepseek-ai+cosmokit@1.8.5/node_modules/@deepseek-ai/cosmokit/lib/index.js
/** Return true when a value is `null` or `undefined`. */
function isNullable(value) {
	return value === null || value === void 0;
}
/** Return true for non-array object values. */
function isPlainObject(data) {
	return data && typeof data === "object" && !Array.isArray(data);
}
/** Filter object entries and return a new object. */
function filterKeys(object, filter) {
	return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
}
/** Map object values while preserving the original key set. */
function mapValues(object, transform) {
	return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
}
/** Pick selected keys from an object, optionally including `undefined` values. */
function pick(source, keys, forced) {
	if (!keys) return { ...source };
	const result = {};
	for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
	return result;
}
/** Shared config references used by schema validators and plugin runtimes. */
const write = Symbol.for("cosmokit.volatile.write");
function snapshot(value, ancestors = /* @__PURE__ */ new Set()) {
	if (typeof value === "function") throw new TypeError("volatile config cannot contain functions");
	if (value === null || typeof value !== "object") return value;
	if (ancestors.has(value)) throw new TypeError("volatile config cannot contain cycles");
	ancestors.add(value);
	try {
		if (Array.isArray(value)) return Object.freeze(value.map((item) => snapshot(item, ancestors)));
		if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError("volatile config objects must be plain objects or arrays");
		return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item, ancestors)])));
	} finally {
		ancestors.delete(value);
	}
}
/**
* Create a detached reference containing an immutable copy of the supplied data.
* @param value - validated config data; class instances and functions are unsupported.
* @returns a reference whose value is updated only by its owning runtime.
*/
function createVolatile(value) {
	let current = snapshot(value);
	return Object.freeze({
		get: () => current,
		[write]: (value$1) => {
			current = value$1;
		}
	});
}
/**
* Identify references across ESM/CJS copies of the shared library.
* @param value - a parsed config value.
* @returns whether the value implements the shared reference protocol.
*/
function isVolatile(value) {
	return typeof value === "object" && value !== null && write in value;
}
/** Test values using `instanceof` with a `toStringTag` fallback. */
function is(type, value) {
	if (arguments.length === 1) return (value$1) => is(type, value$1);
	return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
	return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
	return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
/** Binary source detection and base64/hex conversion helpers. */
var Binary;
(function(Binary$1) {
	Binary$1.is = isArrayBufferLike;
	Binary$1.isSource = isArrayBufferSource;
	function fromSource(source) {
		if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
		else return source;
	}
	Binary$1.fromSource = fromSource;
	function toBase64(source) {
		source = fromSource(source);
		if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
		let binary = "";
		const bytes = new Uint8Array(source);
		for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
		return btoa(binary);
	}
	Binary$1.toBase64 = toBase64;
	function fromBase64(source) {
		if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
		return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
	}
	Binary$1.fromBase64 = fromBase64;
	function toHex(source) {
		source = fromSource(source);
		if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
		return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
	}
	Binary$1.toHex = toHex;
	function fromHex(source) {
		if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
		const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
		const buffer = [];
		for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
		return Uint8Array.from(buffer).buffer;
	}
	Binary$1.fromHex = fromHex;
})(Binary || (Binary = {}));
/** Decode a base64 string into binary data. */
const base64ToArrayBuffer = Binary.fromBase64;
/** Encode binary data as base64. */
const arrayBufferToBase64 = Binary.toBase64;
/** Decode a hex string into binary data. */
const hexToArrayBuffer = Binary.fromHex;
/** Encode binary data as hex. */
const arrayBufferToHex = Binary.toHex;
/** Deep-clone common JavaScript values while preserving prototypes and cycles. */
function clone(source, refs = /* @__PURE__ */ new Map()) {
	if (!source || typeof source !== "object") return source;
	if (is("Date", source)) return new Date(source.valueOf());
	if (is("RegExp", source)) return new RegExp(source.source, source.flags);
	if (isArrayBufferLike(source)) return source.slice(0);
	if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
	const cached = refs.get(source);
	if (cached) return cached;
	if (Array.isArray(source)) {
		const result$1 = [];
		refs.set(source, result$1);
		source.forEach((value, index) => {
			result$1[index] = Reflect.apply(clone, null, [value, refs]);
		});
		return result$1;
	}
	const result = Object.create(Object.getPrototypeOf(source));
	refs.set(source, result);
	for (const key of Reflect.ownKeys(source)) {
		const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
		if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
		Reflect.defineProperty(result, key, descriptor);
	}
	return result;
}
/**
* Compare values recursively, treating two volatile references as equal regardless of value.
* Strict comparison distinguishes null/undefined, treats opaque objects by identity,
* compares URLs by normalized href, treats array holes as undefined, and considers distinct cyclic structures unequal.
* @param a - first value.
* @param b - second value.
* @param strict - whether to require strict data equality outside volatile references.
* @returns whether the values compare equal.
*/
function deepEqual(a, b, strict) {
	const ancestors = /* @__PURE__ */ new Set();
	function compare(a$1, b$1) {
		if (a$1 === b$1) return true;
		if (isVolatile(a$1) || isVolatile(b$1)) return isVolatile(a$1) && isVolatile(b$1);
		if (!strict && isNullable(a$1) && isNullable(b$1)) return true;
		if (typeof a$1 !== typeof b$1 || typeof a$1 !== "object" || !a$1 || !b$1) return false;
		if (ancestors.has(a$1)) return false;
		function check(test, then) {
			return test(a$1) ? test(b$1) ? then(a$1, b$1) : false : test(b$1) ? false : void 0;
		}
		ancestors.add(a$1);
		try {
			return check(Array.isArray, (a$2, b$2) => {
				if (a$2.length !== b$2.length) return false;
				for (let index = 0; index < a$2.length; index++) if (!compare(a$2[index], b$2[index])) return false;
				return true;
			}) ?? check(is("Date"), (a$2, b$2) => a$2.valueOf() === b$2.valueOf()) ?? check(is("URL"), (a$2, b$2) => a$2.href === b$2.href) ?? check(is("RegExp"), (a$2, b$2) => a$2.source === b$2.source && a$2.flags === b$2.flags) ?? check(isArrayBufferLike, (a$2, b$2) => {
				if (a$2.byteLength !== b$2.byteLength) return false;
				const viewA = new Uint8Array(a$2);
				const viewB = new Uint8Array(b$2);
				for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
				return true;
			}) ?? ((!strict || [a$1, b$1].every((value) => Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) && Object.keys({
				...a$1,
				...b$1
			}).every((key) => compare(a$1[key], b$1[key])));
		} finally {
			ancestors.delete(a$1);
		}
	}
	return compare(a, b);
}
/** Time constants plus parsing and formatting helpers. */
var Time;
(function(Time$1) {
	Time$1.millisecond = 1;
	Time$1.second = 1e3;
	Time$1.minute = Time$1.second * 60;
	Time$1.hour = Time$1.minute * 60;
	Time$1.day = Time$1.hour * 24;
	Time$1.week = Time$1.day * 7;
	let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
	function setTimezoneOffset(offset) {
		timezoneOffset = offset;
	}
	Time$1.setTimezoneOffset = setTimezoneOffset;
	function getTimezoneOffset() {
		return timezoneOffset;
	}
	Time$1.getTimezoneOffset = getTimezoneOffset;
	function getDateNumber(date = /* @__PURE__ */ new Date(), offset) {
		if (typeof date === "number") date = new Date(date);
		if (offset === void 0) offset = timezoneOffset;
		return Math.floor((date.valueOf() / Time$1.minute - offset) / 1440);
	}
	Time$1.getDateNumber = getDateNumber;
	function fromDateNumber(value, offset) {
		const date = new Date(value * Time$1.day);
		if (offset === void 0) offset = timezoneOffset;
		return new Date(+date + offset * Time$1.minute);
	}
	Time$1.fromDateNumber = fromDateNumber;
	const numeric = /\d+(?:\.\d+)?/.source;
	const timeRegExp = /* @__PURE__ */ new RegExp(`^${[
		"w(?:eek(?:s)?)?",
		"d(?:ay(?:s)?)?",
		"h(?:our(?:s)?)?",
		"m(?:in(?:ute)?(?:s)?)?",
		"s(?:ec(?:ond)?(?:s)?)?"
	].map((unit) => `(${numeric}${unit})?`).join("")}$`);
	function parseTime(source) {
		const capture = timeRegExp.exec(source);
		if (!capture) return 0;
		return (parseFloat(capture[1]) * Time$1.week || 0) + (parseFloat(capture[2]) * Time$1.day || 0) + (parseFloat(capture[3]) * Time$1.hour || 0) + (parseFloat(capture[4]) * Time$1.minute || 0) + (parseFloat(capture[5]) * Time$1.second || 0);
	}
	Time$1.parseTime = parseTime;
	function parseDate(date) {
		const parsed = parseTime(date);
		if (parsed) date = Date.now() + parsed;
		else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date}`;
		else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date}`;
		return date ? new Date(date) : /* @__PURE__ */ new Date();
	}
	Time$1.parseDate = parseDate;
	function format(ms) {
		const abs = Math.abs(ms);
		if (abs >= Time$1.day - Time$1.hour / 2) return Math.round(ms / Time$1.day) + "d";
		else if (abs >= Time$1.hour - Time$1.minute / 2) return Math.round(ms / Time$1.hour) + "h";
		else if (abs >= Time$1.minute - Time$1.second / 2) return Math.round(ms / Time$1.minute) + "m";
		else if (abs >= Time$1.second) return Math.round(ms / Time$1.second) + "s";
		return ms + "ms";
	}
	Time$1.format = format;
	function toDigits(source, length = 2) {
		return source.toString().padStart(length, "0");
	}
	Time$1.toDigits = toDigits;
	function template(template$1, time = /* @__PURE__ */ new Date()) {
		return template$1.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
	}
	Time$1.template = template;
})(Time || (Time = {}));

//#endregion
//#region node_modules/.pnpm/@deepseek-ai+schemastery@3.18.4/node_modules/@deepseek-ai/schemastery/lib/index.mjs
const kSchema = Symbol.for("schemastery");
const kValidationError = Symbol.for("ValidationError");
globalThis.__schemastery_index__ ??= 0;
globalThis.__schemastery_refs__ = void 0;
var ValidationError = class extends TypeError {
	options;
	name = "ValidationError";
	constructor(message, options) {
		let prefix = "$";
		for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
		else if (typeof segment === "number") prefix += "[" + segment + "]";
		else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
		if (prefix.startsWith(".")) prefix = prefix.slice(1);
		super((prefix === "$" ? "" : `${prefix} `) + message);
		this.options = options;
	}
	static is(error) {
		return !!error?.[kValidationError];
	}
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
const Schema = function(options) {
	const schema = function(data, options$1 = {}) {
		return Schema.resolve(data, schema, options$1)[0];
	};
	if (options.refs) {
		const refs = mapValues(options.refs, (options$1) => new Schema(options$1));
		const getRef = (uid) => refs[uid];
		for (const key in refs) {
			const options$1 = refs[key];
			options$1.sKey = getRef(options$1.sKey);
			options$1.inner = getRef(options$1.inner);
			options$1.list = options$1.list && options$1.list.map(getRef);
			options$1.dict = options$1.dict && mapValues(options$1.dict, getRef);
		}
		return refs[options.uid];
	}
	Object.assign(schema, options);
	if (typeof schema.callback === "string") try {
		schema.callback = new Function("return " + schema.callback)();
	} catch {}
	Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
	Object.setPrototypeOf(schema, Schema.prototype);
	schema.meta ||= {};
	schema.toString = schema.toString.bind(schema);
	return schema;
};
Schema.prototype = Object.create(Function.prototype);
Schema.prototype[kSchema] = true;
Object.defineProperty(Schema.prototype, "~standard", { get() {
	return {
		version: 1,
		vendor: "schemastery",
		validate: (value) => {
			try {
				return { value: Schema.resolve(value, this, {})[0] };
			} catch (error) {
				if (ValidationError.is(error)) return { issues: [{
					message: error.message,
					path: error.options.path
				}] };
				throw error;
			}
		}
	};
} });
Schema.ValidationError = ValidationError;
Schema.prototype.toJSON = function toJSON() {
	if (globalThis.__schemastery_refs__) {
		globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
		return this.uid;
	}
	globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
	globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
	const result = {
		uid: this.uid,
		refs: globalThis.__schemastery_refs__
	};
	globalThis.__schemastery_refs__ = void 0;
	return result;
};
Schema.prototype.set = function set(key, value) {
	this.dict[key] = value;
	return this;
};
Schema.prototype.push = function push(value) {
	this.list.push(value);
	return this;
};
function mergeDesc(original, messages) {
	const result = typeof original === "string" ? { "": original } : { ...original };
	for (const locale in messages) {
		const value = messages[locale];
		if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
		else if (typeof value === "string") result[locale] = value;
	}
	return result;
}
function getInner(value) {
	return value?.$value ?? value?.$inner;
}
function extractKeys(data) {
	return filterKeys(data ?? {}, (key) => !key.startsWith("$"));
}
Schema.prototype.i18n = function i18n(messages) {
	const schema = Schema(this);
	const desc = mergeDesc(schema.meta.description, messages);
	if (Object.keys(desc).length) schema.meta.description = desc;
	if (schema.dict) schema.dict = mapValues(schema.dict, (inner, key) => {
		return inner.i18n(mapValues(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
	});
	if (schema.list) schema.list = schema.list.map((inner, index) => {
		return inner.i18n(mapValues(messages, (data = {}) => {
			if (Array.isArray(getInner(data))) return getInner(data)[index];
			if (Array.isArray(data)) return data[index];
			return extractKeys(data);
		}));
	});
	if (schema.inner) schema.inner = schema.inner.i18n(mapValues(messages, (data) => {
		if (getInner(data)) return getInner(data);
		return extractKeys(data);
	}));
	if (schema.sKey) schema.sKey = schema.sKey.i18n(mapValues(messages, (data) => data?.$key));
	return schema;
};
Schema.prototype.extra = function extra(key, value) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
};
for (const key of [
	"required",
	"disabled",
	"collapse",
	"hidden",
	"loose"
]) Object.assign(Schema.prototype, { [key](value = true) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
} });
Schema.prototype.deprecated = function deprecated() {
	const schema = Schema(this);
	schema.meta.badges ||= [];
	schema.meta.badges.push({
		text: "deprecated",
		type: "danger"
	});
	return schema;
};
Schema.prototype.experimental = function experimental() {
	const schema = Schema(this);
	schema.meta.badges ||= [];
	schema.meta.badges.push({
		text: "experimental",
		type: "warning"
	});
	return schema;
};
Schema.prototype.pattern = function pattern(regexp) {
	const schema = Schema(this);
	const pattern$1 = pick(regexp, ["source", "flags"]);
	schema.meta = {
		...schema.meta,
		pattern: pattern$1
	};
	return schema;
};
Schema.prototype.simplify = function simplify(value) {
	if (isVolatile(value)) value = value.get();
	if (deepEqual(value, this.meta.default, this.type === "dict")) return null;
	if (isNullable(value)) return value;
	if (this.type === "object" || this.type === "dict") {
		const result = {};
		for (const key in value) {
			const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
			if (this.type === "dict" || !isNullable(item)) result[key] = item;
		}
		if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
		return result;
	} else if (this.type === "array" || this.type === "tuple") {
		const result = [];
		value.forEach((value$1, index) => {
			const schema = this.type === "array" ? this.inner : this.list[index];
			const item = schema ? schema.simplify(value$1) : value$1;
			result.push(item);
		});
		return result;
	} else if (this.type === "intersect") {
		const result = {};
		for (const item of this.list) Object.assign(result, item.simplify(value));
		return result;
	} else if (this.type === "union") for (const schema of this.list) try {
		Schema.resolve(value, schema, {});
		return schema.simplify(value);
	} catch {}
	return value;
};
Schema.prototype.toString = function toString(inline) {
	return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
};
Schema.prototype.role = function role(role$1, extra) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		role: role$1,
		extra
	};
	return schema;
};
for (const key of [
	"default",
	"link",
	"comment",
	"description",
	"max",
	"min",
	"step"
]) Object.assign(Schema.prototype, { [key](value) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
} });
Schema.prototype.volatile = function volatile() {
	if (this.meta.volatile) throw new TypeError("volatile schema is already wrapped");
	return this.extra("volatile", true);
};
const resolvers = {};
const checkedVolatile = Symbol("checked-volatile-schema");
function validateVolatileSchema(schema, path = [], blocked = false, seen = /* @__PURE__ */ new Map()) {
	const states = seen.get(schema) ?? /* @__PURE__ */ new Set();
	if (states.has(blocked)) return;
	states.add(blocked);
	seen.set(schema, states);
	if (schema.meta?.volatile && blocked) throw new ValidationError("volatile fields require a fixed object path without an enclosing volatile field", { path });
	const nested = blocked || !!schema.meta?.volatile;
	if (schema.dict) for (const [key, child] of Object.entries(schema.dict)) validateVolatileSchema(child, [...path, key], nested, seen);
	if (schema.sKey) validateVolatileSchema(schema.sKey, [...path, "<key>"], true, seen);
	if (schema.inner && (schema.type !== "lazy" || schema.inner[kSchema])) validateVolatileSchema(schema.inner, [...path, "*"], true, seen);
	if (schema.list) for (let index = 0; index < schema.list.length; index++) validateVolatileSchema(schema.list[index], [...path, String(index)], true, seen);
}
Schema.extend = function extend(type, resolve) {
	resolvers[type] = resolve;
};
Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
	if (!schema) return [data];
	if (!options[checkedVolatile]) {
		validateVolatileSchema(schema, options.path);
		options = {
			...options,
			[checkedVolatile]: true
		};
	}
	if (schema.meta?.volatile) {
		const inner = Schema(schema);
		inner.meta = {
			...schema.meta,
			volatile: false
		};
		const [value, adapted] = Schema.resolve(data, inner, options, strict);
		try {
			return [createVolatile(value), adapted];
		} catch (error) {
			throw new ValidationError(error instanceof Error ? error.message : String(error), options);
		}
	}
	if (options.ignore?.(data, schema)) return [data];
	if (isNullable(data) && schema.type !== "lazy") {
		if (schema.meta.required) throw new ValidationError(`missing required value`, options);
		let current = schema;
		let fallback = schema.meta.default;
		while (current?.type === "intersect" && isNullable(fallback)) {
			current = current.list[0];
			fallback = current?.meta.default;
		}
		if (isNullable(fallback)) return [data];
		data = clone(fallback);
	}
	const callback = resolvers[schema.type];
	if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
	try {
		return callback(data, schema, options, strict);
	} catch (error) {
		if (!schema.meta.loose) throw error;
		return [schema.meta.default];
	}
};
Schema.from = function from(source) {
	if (isNullable(source)) return Schema.any();
	else if ([
		"string",
		"number",
		"boolean"
	].includes(typeof source)) return Schema.const(source).required();
	else if (source[kSchema]) return source;
	else if (typeof source === "function") switch (source) {
		case String: return Schema.string().required();
		case Number: return Schema.number().required();
		case Boolean: return Schema.boolean().required();
		case Function: return Schema.function().required();
		default: return Schema.is(source).required();
	}
	else throw new TypeError(`cannot infer schema from ${source}`);
};
Schema.lazy = function lazy(builder) {
	const toJSON = () => {
		if (!schema.inner[kSchema]) {
			schema.inner = schema.builder();
			schema.inner.meta = {
				...schema.meta,
				...schema.inner.meta
			};
		}
		return schema.inner.toJSON();
	};
	const schema = new Schema({
		type: "lazy",
		builder,
		inner: { toJSON }
	});
	return schema;
};
Schema.natural = function natural() {
	return Schema.number().step(1).min(0);
};
Schema.percent = function percent() {
	return Schema.number().step(.01).min(0).max(1).role("slider");
};
Schema.date = function date() {
	return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
		const date$1 = new Date(value);
		if (isNaN(+date$1)) throw new ValidationError(`invalid date "${value}"`, options);
		return date$1;
	}, true)]);
};
Schema.regExp = function regExp(flag = "") {
	return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
		try {
			return new RegExp(value, flag);
		} catch (e) {
			throw new ValidationError(e.message, options);
		}
	}, true)]);
};
Schema.arrayBuffer = function arrayBuffer(encoding) {
	return Schema.union([
		Schema.is(ArrayBuffer),
		Schema.is(SharedArrayBuffer),
		Schema.transform(Schema.any(), (value, options) => {
			if (Binary.isSource(value)) return Binary.fromSource(value);
			throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
		}, true),
		...encoding ? [Schema.transform(Schema.string(), (value, options) => {
			try {
				return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
			} catch (e) {
				throw new ValidationError(e.message, options);
			}
		}, true)] : []
	]);
};
Schema.extend("lazy", (data, schema, options, strict) => {
	if (!schema.inner[kSchema]) {
		schema.inner = schema.builder();
		schema.inner.meta = {
			...schema.meta,
			...schema.inner.meta
		};
		validateVolatileSchema(schema.inner, options.path, true);
	}
	return Schema.resolve(data, schema.inner, options, strict);
});
Schema.extend("any", (data) => {
	return [data];
});
Schema.extend("never", (data, _, options) => {
	throw new ValidationError(`expected nullable but got ${data}`, options);
});
Schema.extend("const", (data, { value }, options) => {
	if (deepEqual(data, value)) return [value];
	throw new ValidationError(`expected ${value} but got ${data}`, options);
});
function checkWithinRange(data, meta, description, options, skipMin = false) {
	const { max = Infinity, min = -Infinity } = meta;
	if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
	if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
}
Schema.extend("string", (data, { meta }, options) => {
	if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
	if (meta.pattern) {
		const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
		if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
	}
	checkWithinRange(data.length, meta, "string length", options);
	return [data];
});
function decimalShift(data, digits) {
	const str = data.toString();
	if (str.includes("e")) return data * Math.pow(10, digits);
	const index = str.indexOf(".");
	if (index === -1) return data * Math.pow(10, digits);
	const frac = str.slice(index + 1);
	const integer = str.slice(0, index);
	if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
	return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
}
function isMultipleOf(data, min, step) {
	step = Math.abs(step);
	if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
	const index = step.toString().indexOf(".");
	const digits = step.toString().slice(index + 1).length;
	return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
}
Schema.extend("number", (data, { meta }, options) => {
	if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
	checkWithinRange(data, meta, "number", options);
	const { step } = meta;
	if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
	return [data];
});
Schema.extend("boolean", (data, _, options) => {
	if (typeof data === "boolean") return [data];
	throw new ValidationError(`expected boolean but got ${data}`, options);
});
Schema.extend("bitset", (data, { bits, meta }, options) => {
	let value = 0, keys = [];
	if (typeof data === "number") {
		value = data;
		for (const key in bits) if (data & bits[key]) keys.push(key);
	} else if (Array.isArray(data)) {
		keys = data;
		for (const key of keys) {
			if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
			if (key in bits) value |= bits[key];
		}
	} else throw new ValidationError(`expected number or array but got ${data}`, options);
	if (value === meta.default) return [value];
	return [value, keys];
});
Schema.extend("function", (data, _, options) => {
	if (typeof data === "function") return [data];
	throw new ValidationError(`expected function but got ${data}`, options);
});
Schema.extend("is", (data, { constructor }, options) => {
	if (typeof constructor === "function") {
		if (data instanceof constructor) return [data];
		throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
	} else {
		if (isNullable(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
		let prototype = Object.getPrototypeOf(data);
		while (prototype) {
			if (prototype.constructor?.name === constructor) return [data];
			prototype = Object.getPrototypeOf(prototype);
		}
		throw new ValidationError(`expected ${constructor} but got ${data}`, options);
	}
});
function property(data, key, schema, options) {
	try {
		const [value, adapted] = Schema.resolve(data[key], schema, {
			...options,
			path: [...options.path || [], key]
		});
		if (adapted !== void 0) data[key] = adapted;
		return value;
	} catch (e) {
		if (!options?.autofix) throw e;
		delete data[key];
		return schema.meta.volatile ? createVolatile(schema.meta.default) : schema.meta.default;
	}
}
Schema.extend("array", (data, { inner, meta }, options) => {
	if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
	checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
	return [data.map((_, index) => property(data, index, inner, options))];
});
Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
	if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
	const result = {};
	for (const key in data) {
		let rKey;
		try {
			rKey = Schema.resolve(key, sKey, options)[0];
		} catch (error) {
			if (strict) continue;
			throw error;
		}
		result[rKey] = property(data, key, inner, options);
		data[rKey] = data[key];
		if (key !== rKey) delete data[key];
	}
	return [result];
});
Schema.extend("tuple", (data, { list }, options, strict) => {
	if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
	const result = list.map((inner, index) => property(data, index, inner, options));
	if (strict) return [result];
	result.push(...data.slice(list.length));
	return [result];
});
function merge(result, data) {
	for (const key in data) {
		if (key in result) continue;
		result[key] = data[key];
	}
}
Schema.extend("object", (data, { dict }, options, strict) => {
	if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
	const result = {};
	for (const key in dict) {
		const value = property(data, key, dict[key], options);
		if (!isNullable(value) || key in data) result[key] = value;
	}
	if (!strict) merge(result, data);
	return [result];
});
Schema.extend("union", (data, { list, toString }, options, strict) => {
	const messages = [];
	for (const inner of list) try {
		return Schema.resolve(data, inner, options, strict);
	} catch (error) {
		messages.push(error);
	}
	throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
});
Schema.extend("intersect", (data, { list, toString }, options, strict) => {
	if (!list.length) return [data];
	let result;
	for (const inner of list) {
		const value = Schema.resolve(data, inner, options, true)[0];
		if (isNullable(value)) continue;
		if (isNullable(result)) result = value;
		else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
		else if (typeof value === "object") merge(result ??= {}, value);
		else if (result !== value) throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
	}
	if (!strict && isPlainObject(data)) merge(result, data);
	return [result];
});
Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
	const [result, adapted = data] = Schema.resolve(data, inner, options, true);
	if (preserve) return [callback(result)];
	else return [callback(result), callback(adapted)];
});
const formatters = {};
function defineMethod(name, keys, format) {
	formatters[name] = format;
	Object.assign(Schema, { [name](...args) {
		const schema = new Schema({ type: name });
		keys.forEach((key, index) => {
			switch (key) {
				case "sKey":
					schema.sKey = args[index] ?? Schema.string();
					break;
				case "inner":
					schema.inner = Schema.from(args[index]);
					break;
				case "list":
					schema.list = args[index].map(Schema.from);
					break;
				case "dict":
					schema.dict = mapValues(args[index], Schema.from);
					break;
				case "bits":
					schema.bits = {};
					for (const key$1 in args[index]) {
						if (typeof args[index][key$1] !== "number") continue;
						schema.bits[key$1] = args[index][key$1];
					}
					break;
				case "callback": {
					const callback = schema.callback = args[index];
					callback["toJSON"] ||= () => callback.toString();
					break;
				}
				case "constructor": {
					const constructor = schema.constructor = args[index];
					if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
					break;
				}
				default: schema[key] = args[index];
			}
		});
		if (name === "object" || name === "dict") schema.meta.default = {};
		else if (name === "array" || name === "tuple") schema.meta.default = [];
		else if (name === "bitset") schema.meta.default = 0;
		return schema;
	} });
}
defineMethod("is", ["constructor"], ({ constructor }) => {
	if (typeof constructor === "function") return constructor.name;
	else return constructor;
});
defineMethod("any", [], () => "any");
defineMethod("never", [], () => "never");
defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
defineMethod("string", [], () => "string");
defineMethod("number", [], () => "number");
defineMethod("boolean", [], () => "boolean");
defineMethod("bitset", ["bits"], () => "bitset");
defineMethod("function", [], () => "function");
defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
defineMethod("object", ["dict"], ({ dict }) => {
	if (Object.keys(dict).length === 0) return "{}";
	return `{ ${Object.entries(dict).map(([key, inner]) => {
		return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
	}).join(", ")} }`;
});
defineMethod("union", ["list"], ({ list }, inline) => {
	const result = list.map(({ toString: format }) => format()).join(" | ");
	return inline ? `(${result})` : result;
});
defineMethod("intersect", ["list"], ({ list }) => {
	return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
});
defineMethod("transform", [
	"inner",
	"callback",
	"preserve"
], ({ inner }, isInner) => inner.toString(isInner));

//#endregion
//#region src/shared/settings.ts
const SETTINGS_NAMESPACE = "cache-keepalive";
const MIN_DURATION_MS = 1e3;
const MAX_DURATION_MS = 2147483647;
const DEFAULT_SESSION_SETTINGS = Object.freeze({
	enabled: true,
	intervalMs: 24e4,
	idleTimeoutMs: 18e5
});
const durationSchema = Schema.number().min(MIN_DURATION_MS).max(MAX_DURATION_MS).step(1);
/**
* One session's stored preference, with the schema supplying omitted fields.
*
* Every node in this subtree has to stay serializable. The Host projects the
* plugin's `Config` into the envelope a browser settings form rehydrates with
* `new Schema(envelope)` and then validates the served section against; a node
* whose behavior lives in a JavaScript callback (`Schema.transform`) does not
* survive that round trip, so the rehydrated copy would reject every stored
* section and the form would stay at `loading` forever. Strict field checking
* therefore rides the document's Standard Schema face instead — see
* {@link settingsSchema}.
*/
const sessionSettingsSchema = Schema.object({
	enabled: Schema.boolean().default(DEFAULT_SESSION_SETTINGS.enabled),
	intervalMs: Schema.number().min(MIN_DURATION_MS).max(MAX_DURATION_MS).step(1).default(DEFAULT_SESSION_SETTINGS.intervalMs),
	idleTimeoutMs: Schema.number().min(MIN_DURATION_MS).max(MAX_DURATION_MS).step(1).default(DEFAULT_SESSION_SETTINGS.idleTimeoutMs)
});
/** Loader-owned live configuration; persisted session values remain plain JSON. */
const documentSchema = Schema.object({ sessions: Schema.dict(sessionSettingsSchema).default({}).volatile() });
/**
* The Loader-resolved configuration schema.
*
* The Loader validates a plugin's `Config` through its Standard Schema face
* (`runtime.Config['~standard'].validate`), while the settings forms project the
* same object through `toJSON()` for the browser. Composing both faces here
* keeps the strict document check off the serialized envelope: the projected
* subtree stays plain, so a browser form decodes every served section, and a
* write carrying an unknown or invalid field is still refused before it can
* reach the profile patch.
*/
const settingsSchema = withStrictDocument(documentSchema, decodeSettingsDocument);
/**
* Add a strict document check to one schema's Standard Schema face.
*
* The supplied check runs only after the schema itself resolved the input, so
* the resolved output — including the volatile session reference the Host
* reads — stays the schema's own.
*
* @param schema - the document schema the Loader and the forms share.
* @param checkDocument - rejects an input document this plugin cannot store.
* @returns the same schema instance, with the strict face installed.
*/
function withStrictDocument(schema, checkDocument) {
	const standard = schema["~standard"];
	Object.defineProperty(schema, "~standard", {
		configurable: true,
		value: {
			version: standard.version,
			vendor: standard.vendor,
			validate(value) {
				const result = standard.validate(value);
				if (!("then" in result) && result.issues === void 0) checkDocument(value === void 0 ? {} : value);
				return result;
			}
		}
	});
	return schema;
}
function isPlainRecord(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}
function validateDuration(value) {
	if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) throw new TypeError("Duration must be a finite integer number of milliseconds");
	return durationSchema(value);
}
/** Validate one persisted session preference without accepting unknown fields. */
function decodeSessionSettings(input) {
	if (!isPlainRecord(input) || Object.keys(input).some((key) => ![
		"enabled",
		"intervalMs",
		"idleTimeoutMs"
	].includes(key))) throw new TypeError("Invalid session keepalive settings");
	const enabled = input.enabled === void 0 ? DEFAULT_SESSION_SETTINGS.enabled : input.enabled;
	if (typeof enabled !== "boolean") throw new TypeError("Enabled must be a boolean");
	return {
		enabled,
		intervalMs: input.intervalMs === void 0 ? DEFAULT_SESSION_SETTINGS.intervalMs : validateDuration(input.intervalMs),
		idleTimeoutMs: input.idleTimeoutMs === void 0 ? DEFAULT_SESSION_SETTINGS.idleTimeoutMs : validateDuration(input.idleTimeoutMs)
	};
}
/** Validate the persistence boundary without coercion, then resolve defaults. */
function decodeSettingsDocument(value) {
	if (!isPlainRecord(value) || Object.keys(value).some((key) => key !== "sessions")) throw new TypeError("Expected a keepalive settings document");
	const sessions = value.sessions === void 0 ? {} : value.sessions;
	if (!isPlainRecord(sessions)) throw new TypeError("Expected a session settings dictionary");
	const entries = [];
	for (const [id, input] of Object.entries(sessions)) entries.push([id, decodeSessionSettings(input)]);
	return { sessions: Object.fromEntries(entries) };
}
/** Resolve only the selected session without creating persistent entries. */
function getSessionSettings(document, sessionId) {
	return Object.hasOwn(document.sessions, sessionId) ? document.sessions[sessionId] ?? DEFAULT_SESSION_SETTINGS : DEFAULT_SESSION_SETTINGS;
}
/** Convert user-facing minutes to bounded millisecond precision. */
function minutesToMilliseconds(minutes) {
	return validateDuration(Math.round(minutes * 6e4));
}

//#endregion
//#region src/client/KeepaliveControl.tsx
/**
* Render a stored duration as the minutes the user edits. The exact quotient is
* what keeps the round trip lossless: a rounded display would turn an untouched
* 1000ms field into 1020ms the moment it were written back.
* @param milliseconds - stored duration.
* @returns the minutes text shown in the field.
*/
function formatMinutes(milliseconds) {
	return String(milliseconds / 6e4);
}
/** Resolve the status line for the current view, or null while there is nothing to report. */
function statusLine(view, invalid, t) {
	if (invalid) return {
		text: t("invalidDuration"),
		tone: "error"
	};
	switch (view.status) {
		case "loading": return {
			text: t("statusLoading"),
			tone: "info"
		};
		case "saving": return {
			text: t("statusSaving"),
			tone: "info"
		};
		case "saved": return {
			text: t("statusSaved"),
			tone: "success"
		};
		case "conflict": return {
			text: t("statusConflict"),
			tone: "warn"
		};
		case "readonly": return {
			text: t("statusReadonly"),
			tone: "info"
		};
		case "unavailable": return {
			text: t("statusUnavailable"),
			tone: "warn"
		};
		case "error": return {
			text: view.detail ?? t("statusUnavailable"),
			tone: "error"
		};
		default: return null;
	}
}
/** Theme token carrying one status tone. */
function toneColor(tone) {
	switch (tone) {
		case "error": return "var(--dsw-alias-state-error-primary, #c62828)";
		case "warn": return "var(--dsw-alias-state-warn-primary, #a15c00)";
		case "success": return "var(--dsw-alias-state-success-primary, #2e7d32)";
		default: return "var(--dsw-alias-label-tertiary, inherit)";
	}
}
const visuallyHidden = {
	position: "absolute",
	width: 1,
	height: 1,
	margin: -1,
	padding: 0,
	overflow: "hidden",
	clip: "rect(0 0 0 0)",
	whiteSpace: "nowrap",
	border: 0
};
const wrapperStyle = {
	position: "relative",
	display: "inline-flex",
	alignItems: "center",
	gap: 2
};
const panelStyle = {
	position: "absolute",
	bottom: "calc(100% + 8px)",
	left: 0,
	zIndex: 20,
	display: "grid",
	gap: 6,
	minWidth: 232,
	padding: "10px 12px",
	background: "var(--dsw-alias-bg-layer-2, #ffffff)",
	color: "var(--dsw-alias-label-primary, inherit)",
	border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
	borderRadius: 8,
	boxShadow: "0 8px 24px var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.12))",
	fontSize: 12,
	lineHeight: 1.4,
	textAlign: "left"
};
const inputStyle = {
	width: "100%",
	boxSizing: "border-box",
	padding: "3px 6px",
	background: "var(--dsw-alias-bg-base, transparent)",
	color: "inherit",
	border: "1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12))",
	borderRadius: 6,
	font: "inherit"
};
/** Style one compact control button. */
function buttonStyle(options) {
	return {
		display: "inline-flex",
		alignItems: "center",
		gap: 4,
		height: 24,
		padding: "0 8px",
		border: `1px solid ${options.active ? "var(--dsw-alias-brand-primary, #247bbf)" : "var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))"}`,
		borderRadius: 12,
		background: options.active ? "var(--dsw-alias-brand-primary, #247bbf)" : "transparent",
		color: options.active ? "var(--dsw-alias-label-primary-inverted, #ffffff)" : "var(--dsw-alias-label-secondary, inherit)",
		font: "inherit",
		fontSize: 11,
		lineHeight: 1,
		cursor: options.disabled ? "not-allowed" : "pointer",
		opacity: options.disabled ? .6 : 1
	};
}
/**
* Compact per-session keepalive control for the composer tool row: a switch for
* this session's preference and a panel editing its two durations.
* @param props - composed slot props: the injected view hook, the three field
* writers, and the locale seat.
* @returns the compact control and, while open, its settings panel.
*/
function KeepaliveControl({ sessionId, useKeepalive, setEnabled, setIntervalMinutes, setIdleTimeoutMinutes, t }) {
	const view = useKeepalive((current) => current);
	const [open, setOpen] = (0, react.useState)(false);
	const [drafts, setDrafts] = (0, react.useState)({
		intervalMs: null,
		idleTimeoutMs: null
	});
	const [invalid, setInvalid] = (0, react.useState)(false);
	const [boundSession, setBoundSession] = (0, react.useState)(sessionId);
	const baseId = (0, react.useId)();
	const intervalId = `${baseId}-interval`;
	const idleId = `${baseId}-idle`;
	if (boundSession !== sessionId) {
		setBoundSession(sessionId);
		setDrafts({
			intervalMs: null,
			idleTimeoutMs: null
		});
		setInvalid(false);
	}
	const interactive = !(view.status === "saving") && (view.status === "ready" || view.status === "saved" || view.status === "error" || view.status === "conflict");
	const line = statusLine(view, invalid, t);
	/**
	* Commit one edited duration draft. Only a dirty draft is committed, so a
	* blur that merely follows a save can never write the displayed value back,
	* and one edit produces exactly one settings write.
	*/
	const commitMinutes = (field, text) => {
		if (drafts[field] === null) return;
		setDrafts((current) => ({
			...current,
			[field]: null
		}));
		if (!interactive) return;
		const minutes = Number(text.trim());
		if (text.trim() === "" || !Number.isFinite(minutes)) {
			setInvalid(true);
			return;
		}
		try {
			minutesToMilliseconds(minutes);
		} catch {
			setInvalid(true);
			return;
		}
		setInvalid(false);
		field === "intervalMs" ? setIntervalMinutes(minutes) : setIdleTimeoutMinutes(minutes);
	};
	/** Render one labelled minute field over a draft or the stored value. */
	const durationField = (field, id, label) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: {
			display: "grid",
			gap: 2
		},
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
			htmlFor: id,
			children: label
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
			id,
			type: "number",
			step: "any",
			style: inputStyle,
			disabled: !interactive,
			value: drafts[field] ?? formatMinutes(view.settings[field]),
			onChange: (event) => {
				setInvalid(false);
				setDrafts((current) => ({
					...current,
					[field]: event.target.value
				}));
			},
			onBlur: (event) => commitMinutes(field, event.target.value),
			onKeyDown: (event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					event.stopPropagation();
					commitMinutes(field, event.currentTarget.value);
				}
				if (event.key === "Escape") {
					event.stopPropagation();
					setOpen(false);
				}
			}
		})]
	});
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: wrapperStyle,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				role: "switch",
				"aria-checked": view.settings.enabled,
				"aria-label": t("switchLabel"),
				title: t("hint"),
				disabled: !interactive,
				style: buttonStyle({
					active: view.settings.enabled,
					disabled: !interactive
				}),
				onClick: () => {
					if (!interactive) return;
					setEnabled(!view.settings.enabled);
				},
				children: t("compactLabel")
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				"aria-label": t("settingsLabel"),
				"aria-expanded": open,
				"aria-haspopup": "dialog",
				style: buttonStyle({
					active: open,
					disabled: false
				}),
				onClick: () => setOpen((current) => !current),
				children: "⚙"
			}),
			line !== null && !open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				role: "status",
				"aria-live": "polite",
				style: visuallyHidden,
				children: line.text
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				role: "status",
				"aria-live": "polite",
				style: visuallyHidden
			}),
			open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				role: "dialog",
				"aria-label": t("panelTitle"),
				style: panelStyle,
				onKeyDown: (event) => {
					if (event.key === "Escape") setOpen(false);
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("panelTitle") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: { color: "var(--dsw-alias-label-tertiary, inherit)" },
						children: t("hint")
					}),
					durationField("intervalMs", intervalId, t("intervalLabel")),
					durationField("idleTimeoutMs", idleId, t("idleTimeoutLabel")),
					line !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: { color: toneColor(line.tone) },
						children: line.text
					}) : null
				]
			}) : null
		]
	});
}

//#endregion
//#region src/client/control-model.ts
/** Narrow one unknown boundary value to a plain record. */
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Read a human-readable detail from an unknown failure at the write boundary. */
function describeFailure(reason) {
	if (typeof reason === "string" && reason !== "") return reason;
	if (reason instanceof Error && reason.message !== "") return reason.message;
	if (isRecord(reason)) {
		const message = reason["message"];
		if (typeof message === "string" && message !== "") return message;
		const code = reason["code"];
		if (typeof code === "string" && code !== "") return code;
	}
	return "The settings write failed";
}
/**
* Create the per-session control over one bound settings namespace form.
*
* Writes carry the namespace revision as their fence, so a concurrent change
* from another surface is refused instead of overwriting it. The control never
* reports a stored value the Host did not confirm.
* @param options - the bound entry form and the session this control addresses.
* @returns the observable control with its three field writers.
*/
function createKeepaliveControl(options) {
	const { form, sessionId } = options;
	const listeners = /* @__PURE__ */ new Set();
	let unsubscribeScope = null;
	let write$1 = {
		phase: "idle",
		detail: null
	};
	let chain = null;
	let cached = null;
	/** Scope snapshot the cached view was derived from; the scope's reference is stable per change. */
	let cachedFor = null;
	/** Resolve the readable state of the addressed session from the scope snapshot. */
	function baseState() {
		const snapshot$1 = form.getSnapshot();
		if (snapshot$1.status === "loading") return {
			status: "loading",
			settings: DEFAULT_SESSION_SETTINGS
		};
		if (snapshot$1.status !== "ready" || snapshot$1.value === void 0) return {
			status: "unavailable",
			settings: DEFAULT_SESSION_SETTINGS
		};
		let settings;
		try {
			settings = getSessionSettings(decodeSettingsDocument(snapshot$1.value), sessionId);
		} catch {
			return {
				status: "unavailable",
				settings: DEFAULT_SESSION_SETTINGS
			};
		}
		if (!snapshot$1.writable || snapshot$1.mode === "memory") return {
			status: "readonly",
			settings
		};
		return {
			status: "ready",
			settings
		};
	}
	/**
	* Compose the published view from the scope snapshot and the write phase. The
	* scope stays the only authority on the stored value, and a base state that
	* cannot be edited outranks any write outcome: a section that became readonly
	* after a successful save must not keep presenting itself as editable.
	*/
	function computeView() {
		const base = baseState();
		if (base.status !== "ready") return {
			status: base.status,
			settings: base.settings,
			detail: null
		};
		const settings = base.settings;
		switch (write$1.phase) {
			case "saving": return {
				status: "saving",
				settings,
				detail: null
			};
			case "saved": return {
				status: "saved",
				settings,
				detail: null
			};
			case "error": return {
				status: "error",
				settings,
				detail: write$1.detail
			};
			case "conflict": return {
				status: "conflict",
				settings,
				detail: write$1.detail
			};
			default: return {
				status: base.status,
				settings,
				detail: null
			};
		}
	}
	/** Invalidate the cached view and notify every subscriber. */
	function notify() {
		cached = null;
		for (const listener of [...listeners]) listener();
	}
	/** Observe an external document change. */
	function handleScopeChange() {
		notify();
	}
	/** Run one write task after the previously queued one, never rejecting the queue. */
	function enqueue(task) {
		const previous = chain;
		const run = previous === null ? task() : previous.then(task, task);
		const settled = run.then(() => {
			if (chain === settled) chain = null;
		}, () => {
			if (chain === settled) chain = null;
		});
		chain = settled;
		return run;
	}
	/** Store one field of the addressed session, fenced by the current revision. */
	async function runWrite(field, value) {
		const snapshot$1 = form.getSnapshot();
		if (baseState().status !== "ready") return;
		const fence = snapshot$1.revision;
		write$1 = {
			phase: "saving",
			detail: null
		};
		notify();
		const ops = [{
			op: "set",
			path: [
				"sessions",
				sessionId,
				field
			],
			value
		}];
		try {
			if (await form.mutate(ops, fence)) write$1 = {
				phase: "saved",
				detail: null
			};
			else {
				const settled = form.getSnapshot().revision;
				write$1 = {
					phase: fence !== void 0 && settled !== void 0 && settled !== fence ? "conflict" : "error",
					detail: null
				};
			}
		} catch (reason) {
			const settled = form.getSnapshot().revision;
			write$1 = {
				phase: fence !== void 0 && settled !== void 0 && settled !== fence ? "conflict" : "error",
				detail: describeFailure(reason)
			};
		}
		notify();
	}
	/** Queue one field write of the addressed session. */
	function performWrite(field, value) {
		return enqueue(() => runWrite(field, value));
	}
	/** Queue a duration write, converting user-facing minutes inside the queue. */
	function performDurationWrite(field, minutes) {
		return enqueue(async () => {
			let milliseconds;
			try {
				milliseconds = minutesToMilliseconds(minutes);
			} catch (reason) {
				if (baseState().status === "ready") {
					write$1 = {
						phase: "error",
						detail: describeFailure(reason)
					};
					notify();
				}
				return;
			}
			await runWrite(field, milliseconds);
		});
	}
	return {
		getSnapshot() {
			const source = form.getSnapshot();
			if (cached === null || cachedFor !== source) {
				cached = computeView();
				cachedFor = source;
			}
			return cached;
		},
		subscribe(listener) {
			listeners.add(listener);
			if (listeners.size === 1) unsubscribeScope = form.subscribe(handleScopeChange);
			let active = true;
			return () => {
				if (!active) return;
				active = false;
				listeners.delete(listener);
				if (listeners.size === 0) {
					unsubscribeScope?.();
					unsubscribeScope = null;
				}
			};
		},
		setEnabled(enabled) {
			return performWrite("enabled", enabled);
		},
		setIntervalMinutes(minutes) {
			return performDurationWrite("intervalMs", minutes);
		},
		setIdleTimeoutMinutes(minutes) {
			return performDurationWrite("idleTimeoutMs", minutes);
		}
	};
}

//#endregion
//#region src/client/plugin.ts
/** Build the injected business face over one session's control. */
function injectedKeepaliveFace(control) {
	return {
		hooks: { keepalive: control },
		setEnabled: (enabled) => control.setEnabled(enabled),
		setIntervalMinutes: (minutes) => control.setIntervalMinutes(minutes),
		setIdleTimeoutMinutes: (minutes) => control.setIdleTimeoutMinutes(minutes)
	};
}
/** Build the composer-left entry over a per-session control resolver. */
function keepaliveEntry(controlFor) {
	return {
		name: "conversation.input.left",
		id: "cache-keepalive",
		order: 10,
		locale: KEEPALIVE_LOCALE_NAMESPACE,
		inject: (sessionId) => injectedKeepaliveFace(controlFor(sessionId))
	};
}
/**
* Register the compact keepalive control: its dictionaries, its settings scope,
* and one composer-left entry that owns a per-session control.
* @param host - the client capabilities this plugin consumes.
*/
function installKeepaliveControl(host) {
	host.effect(() => host.registerDictionaries(keepaliveDictionaries), "cache-keepalive: dictionaries");
	const form = host.formFor(SETTINGS_NAMESPACE);
	const controls = /* @__PURE__ */ new Map();
	/** One control per session, so repeated entry activation reuses the same source. */
	const controlFor = (sessionId) => {
		const existing = controls.get(sessionId);
		if (existing !== void 0) return existing;
		const created = createKeepaliveControl({
			form,
			sessionId
		});
		controls.set(sessionId, created);
		return created;
	};
	host.effect(() => () => {
		controls.clear();
	}, "cache-keepalive: control cache");
	host.registerControl(keepaliveEntry(controlFor), KeepaliveControl);
}

//#endregion
//#region src/client/index.ts
/** Services this client plugin requires: slot registration, settings forms, and locale. */
const inject = [
	"slots",
	"configForms",
	"locale"
];
/**
* Adapt the DSH client context to the keepalive host seam.
*
* The slot entry is contributed through `slots.inject` rather than registered
* directly: `slots.register` throws while its target slot is undeclared, and
* `conversation.input.left` is itself declared late — the conversation plugin
* declares it while waiting for the `main` slot. A direct registration would
* therefore fail on a cold boot and silently drop this control; `inject` runs
* the registration synchronously when the declaration already exists, and
* inside the declaring call otherwise.
*
* The settings form is resolved by entry id through `configForms.get`, which
* owns one shared form per Host entry and accepts no decoder: the section
* reaches the control raw — its `sessions` dictionary is not narrowed here —
* and the control validates that snapshot at its own boundary.
* @param ctx - the client context capabilities this plugin consumes.
* @returns the host seam `installKeepaliveControl` installs against.
*/
function adaptContext(ctx) {
	return {
		effect: (callback, label) => {
			ctx.effect(callback, label);
		},
		registerDictionaries: (dictionaries) => ctx.locale.register(KEEPALIVE_LOCALE_NAMESPACE, dictionaries),
		formFor: (entryId) => ctx.configForms.get(entryId),
		registerControl: (options, component) => ctx.slots.inject(options.name, () => ctx.slots.register(options, component))
	};
}
/**
* Client plugin body: install the compact per-session keepalive control.
* @param ctx - client cordis context.
*/
function apply(ctx) {
	installKeepaliveControl(adaptContext(ctx));
}

//#endregion
exports.adaptContext = adaptContext;
exports.apply = apply;
exports.inject = inject;
return module.exports;}});