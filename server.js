const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { ReplitConnectors } = require("@replit/connectors-sdk");

const PORT = Number(process.env.PORT || 5000);
const ROOT = __dirname;
const connectors = new ReplitConnectors();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

async function supabaseRequest(endpoint, options = {}) {
  const response = await connectors.proxy("supabase", endpoint, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: response.ok, status: response.status, body };
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 16_000) {
        reject(new Error("La solicitud es demasiado grande."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function handleVisits(req, res) {
  if (req.method === "GET") {
    const result = await supabaseRequest(
      "/rest/v1/uagrm_visitas_ranking?select=modulo_id,modulo_nombre,visitas,ultima_visita&order=visitas.desc,modulo_nombre.asc",
      { method: "GET", headers: { Accept: "application/json" } },
    );

    if (!result.ok) {
      const missingTable = result.status === 404 &&
        result.body && result.body.code === "PGRST205";
      return sendJson(res, 503, {
        ok: false,
        setupRequired: missingTable,
        message: missingTable
          ? "Falta crear el esquema de estadísticas de Supabase."
          : "No se pudieron cargar las estadísticas globales.",
        providerError: result.body,
      });
    }

    const entries = Array.isArray(result.body) ? result.body : [];
    const totalVisits = entries.reduce(
      (total, entry) => total + (Number(entry.visitas) || 0),
      0,
    );
    return sendJson(res, 200, {
      ok: true,
      entries,
      totalVisits,
      fetchedAt: new Date().toISOString(),
    });
  }

  if (req.method === "POST") {
    let payload;
    try {
      payload = JSON.parse(await readRequestBody(req));
    } catch (error) {
      return sendJson(res, 400, { ok: false, message: error.message || "JSON inválido." });
    }

    const moduloId = Number(payload && payload.moduloId);
    const moduloNombre = typeof (payload && payload.moduloNombre) === "string"
      ? payload.moduloNombre.trim()
      : "";
    if (!Number.isInteger(moduloId) || moduloId <= 0 || !moduloNombre || moduloNombre.length > 200) {
      return sendJson(res, 400, { ok: false, message: "Módulo inválido." });
    }

    const result = await supabaseRequest("/rest/v1/uagrm_visitas", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        modulo_id: moduloId,
        modulo_nombre: moduloNombre,
        visitado_en: new Date().toISOString(),
      }),
    });

    if (!result.ok) {
      const missingTable = result.status === 404 &&
        result.body && result.body.code === "PGRST205";
      return sendJson(res, 503, {
        ok: false,
        setupRequired: missingTable,
        message: missingTable
          ? "Falta crear el esquema de estadísticas de Supabase."
          : "No se pudo registrar la visita global.",
        providerError: result.body,
      });
    }
    return sendJson(res, 201, { ok: true });
  }

  res.setHeader("Allow", "GET, POST");
  return sendJson(res, 405, { ok: false, message: "Método no permitido." });
}

function serveStatic(req, res, pathname) {
  const requestedPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(ROOT, requestedPath);
  const relativePath = path.relative(ROOT, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return sendJson(res, 403, { ok: false, message: "Acceso denegado." });
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      return sendJson(res, 404, { ok: false, message: "Recurso no encontrado." });
    }
    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (requestUrl.pathname === "/api/visits") {
      await handleVisits(req, res);
      return;
    }
    if (requestUrl.pathname === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }
    serveStatic(req, res, requestUrl.pathname);
  } catch (error) {
    console.error("Error en la solicitud:", error);
    sendJson(res, 500, { ok: false, message: "Error interno del servidor." });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor UAGRM escuchando en http://0.0.0.0:${PORT}`);
});