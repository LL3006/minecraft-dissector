const dataPath = require("./minecraft-data/data/dataPaths.json")

const data = require(`./minecraft-data/data/${dataPath.pc["1.16.3"].protocol}/protocol.json`)
const assert = require("assert")

function indent(code, n = 2) {
  return code
    .split("\n")
    .map((line) => " ".repeat(n) + line)
    .join("\n")
}

function unsnake(s) {
  return s
    .split("_")
    .map((e) => e[0].toUpperCase() + e.slice(1).toLowerCase())
    .join(" ")
}

function uncamel(s) {
  return s
    .replace(/_\w/g, (m) => m[1].toUpperCase())
    .replace(/[A-Z0-9]{2,}/, (m) => m[0] + m.slice(1).toLowerCase())
    .split(/(?=[A-Z0-9])/)
    .map((e) => e[0].toUpperCase() + e.slice(1).toLowerCase())
    .join(" ")
}

const natives = {
  container(args, types, { path }) {
    return {
      code: args
        .map(({ type, name, anon }) => {
          // if (name === 'item') console.error(type)
          const new_path = `${path}_${name}`
          const { code, hf_type } = generate_snippet(type, types, undefined, {
            path: new_path,
            name
          })
          hf.push({
            name,
            path: new_path,
            type: hf_type || "FT_NONE",
          })
          return code
        })
        .join("\n"),
    }
  },
  varint(args, types, { path }) {
    return {
      code: `minecraft_add_varint(tree, hf_${path}, tvb, &offset);`,
      hf_type: "FT_UINT32",
      return_type: "guint32"
    }
  },
  string(args, types, { path }) {
    return {
      code: `minecraft_add_string(tree, hf_${path}, tvb, &offset);`,
      hf_type: "FT_STRING",
    }
  },
  bool(args, types, { path }) {
    return {
      code: `minecraft_add_bool(tree, hf_${path}, tvb, &offset);`,
      hf_type: "FT_BOOLEAN",
    }
  },
  u8(args, types, { path }) {
    return {
      code: `minecraft_add_u8(tree, hf_${path}, tvb, &offset);`,
      hf_type: "FT_UINT8",
    }
  },
  i8(args, types, { path }) {
    return {
      code: `minecraft_add_i8(tree, hf_${path}, tvb, &offset);`,
      hf_type: "FT_INT8",
    }
  },
  u16(args, types, { path }) {
    return {
      code: `minecraft_add_u16(tree, hf_${path}, tvb, &offset);`,
      hf_type: "FT_UINT16",
    }
  },
  i16(args, types, { path }) {
    return {
      code: `minecraft_add_i16(tree, hf_${path}, tvb, &offset);`,
      hf_type: "FT_INT16",
    }
  },
  i32(args, types, { path }) {
    return {
      code: `minecraft_add_i32(tree, hf_${path}, tvb, &offset);`,
      hf_type: "FT_INT32",
    }
  },
  i64(args, types, { path }) {
    return {
      code: `minecraft_add_i64(tree, hf_${path}, tvb, &offset);`,
      hf_type: "FT_INT64",
    }
  },
  f32(args, types, { path }) {
    return {
      code: `minecraft_add_f32(tree, hf_${path}, tvb, &offset);`,
      hf_type: "FT_FLOAT",
    }
  },
  f64(args, types, { path }) {
    return {
      code: `minecraft_add_f64(tree, hf_${path}, tvb, &offset);`,
      hf_type: "FT_DOUBLE",
    }
  },
  UUID(args, types, { path }) {
    return {
      code: `minecraft_add_UUID(tree, hf_${path}, tvb, &offset);`,
      hf_type: "FT_BYTES",
    }
  },
  restBuffer(args, types, { path }) {
    return {
      code: `minecraft_add_restbuffer(tree, hf_${path}, tvb, &offset);`,
      hf_type: "FT_BYTES",
    }
  },
  buffer({ countType }, types, {path, name }) {
    const count = generate_snippet(countType, types, undefined, { path: `${path}_len`})

    hf.push({
      name: name ? `${name}Length` : 'Length',
      path: `${path}_len`,
      type: count.hf_type,
    })

    return {
      code:
`${count.return_type} ${path}_len = ${count.code}
minecraft_add_buffer(tree, hf_${path}, tvb, &offset, ${path}_len);`,
      hf_type: "FT_BYTES",
    }
  },
  option(args, types, ctx) {
    const inner = generate_snippet(args, types, undefined, ctx)
    return {
      code:
`if (tvb_get_guint8(tvb, offset) == 1) {
  offset += 1;
  ${inner.code}
}`,
      hf_type: inner.hf_type,
    }
  },
}

class UnsupportedError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsupportedError";
  }
}
  
const functions = []
const hf = []

function generate_snippet(type, types, args, ctx = {}) {
  let fieldInfo
  if (typeof type === "string") {
    if (!(type in types)) throw new UnsupportedError("Unknown type " + type)

    fieldInfo = types[type]
  } else fieldInfo = type

  if (typeof fieldInfo === "function") {
    return fieldInfo(args, types, ctx)
  }
  if (typeof fieldInfo === "string") {
    if (fieldInfo === "native") {
      throw new UnsupportedError("Unknown native " + type)
    }
    return generate_snippet(fieldInfo, types, args, ctx)
  } else if (Array.isArray(fieldInfo)) {
    return generate_snippet(fieldInfo[0], types, fieldInfo[1], ctx)
  } else throw new UnsupportedError("Invalid type " + type)
}

function types_from_namespace(namespace) {
  const types = {}
  
  const res = namespace.reduce((c, v) => {
    if (c.types) {
      Object.assign(types, c.types)
    }
    return c[v]
  }, data)

  if (res.types) {
    Object.assign(types, res.types)
  }

  Object.assign(types, natives)
  return types
}

function generate(namespace) {
  const TYPES = types_from_namespace(namespace)
  const { packet } = TYPES

  assert(Array.isArray(packet) && packet.length == 2)
  assert(packet[0] === "container")
  assert(packet[1][0].name === "name" && packet[1][0].type[0] === "mapper")
  assert(packet[1][1].name === "params" && packet[1][1].type[0] === "switch")
  assert(packet[1][0].type[1].type === "varint")

  const names = packet[1][0].type[1].mappings
  const names_to_types = packet[1][1].type[1].fields

  const path = namespace.join("_")

  functions.push(
    `void ${path}(guint32 packet_id, tvbuff_t *tvb, packet_info *pinfo, proto_tree *tree, guint offset, guint32 len) {
  switch (packet_id) {
${indent(
    Object.entries(names)
      .map(([id, name]) => {
        let code
        try {
          snippet = generate_snippet(names_to_types[name], TYPES, undefined, {
            path: `${path}_${name}`,
          })
          code = snippet.code
        } catch (e) {
          if (!(e instanceof UnsupportedError)) throw e;
          code = `// [STUB]: ${e.message}`
        }

        return `case ${id}:
  col_set_str(pinfo->cinfo, COL_INFO, "${unsnake(name)} [${namespace[0]}] (${namespace[1]})");
${indent(code)}
  break;`
      }, "    ")
      .join("\n")
  )}
  }
}`
  )
}

generate(["handshaking", "toServer"])
generate(["handshaking", "toClient"])

generate(["status", "toServer"])
generate(["status", "toClient"])

generate(["login", "toServer"])
generate(["login", "toClient"])

generate(["play", "toServer"])
generate(["play", "toClient"])

const NONE_TYPES = ["FT_STRING", "FT_BYTES", "FT_FLOAT", "FT_DOUBLE", "FT_NONE"]

console.log(
`${(hf.map(({ path }) => `static int hf_${path} = -1;`).join("\n"))}

static hf_register_info hf_generated[] = {
${indent(
  hf
    .map(({ name, path, type }) => {
      return `{ &hf_${path},
  { "${uncamel(name)}", "minecraft.${path.replace(/_/g, ".")}", ${type}, ${
      NONE_TYPES.includes(type)  ? "BASE_NONE" : "BASE_DEC"
      }, NULL,
    0x0, "${uncamel(name)}", HFILL }},`
    })
    .join("\n\n")
)}
};

${functions.join("\n\n")}
`)