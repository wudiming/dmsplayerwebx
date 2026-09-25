import { resolve } from "node:path";
import { defineConfig } from "vite";
import UnoCSS from "unocss/vite";
import vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";
import Icons from "unplugin-icons/vite";
import IconsResolver from "unplugin-icons/resolver";
import { FileSystemIconLoader } from "unplugin-icons/loaders";
import RekaResolver from "reka-ui/resolver";
import Components from "unplugin-vue-components/vite";

export default defineConfig({
  root: ".",
  define: {
    __APP_VERSION__: JSON.stringify("1.0.0"),
    __APP_REPO_URL__: JSON.stringify("https://github.com/wudiming/dmsplayerwebx"),
    __APP_REPO_NAME__: JSON.stringify("wudiming/dmsplayerwebx"),
    __APP_AUTHOR__: JSON.stringify("wudiming"),
    __APP_HOMEPAGE__: JSON.stringify("https://github.com/wudiming/dmsplayerwebx"),
    __APP_AUTHOR_URL__: JSON.stringify("https://github.com/wudiming"),
    __COMMIT_HASH__: JSON.stringify("v1.0.0"),
    __COMMIT_DATE__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
  },
  publicDir: resolve(__dirname, "public"),
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@shared": resolve(__dirname, "shared"),
      "@root": resolve(__dirname),
      "lyric-kit": resolve(__dirname, "node_modules/lyric-kit"),
    },
  },
  plugins: [
    vue(),
    UnoCSS(),
    AutoImport({
      imports: ["vue", "pinia", "vue-router", "@vueuse/core", "vue-i18n"],
    }),
    Icons({
      compiler: "vue3",
      scale: 1,
      customCollections: {
        sp: FileSystemIconLoader(resolve(__dirname, "src/assets/icons")),
      },
    }),
    Components({
      dirs: ["src/components"],
      resolvers: [RekaResolver(), IconsResolver({ prefix: "icon", customCollections: ["sp"] })],
    }),
    {
      name: "splayer-api-server",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url && req.url.startsWith("/api/")) {
            try {
              const handlerModule = await server.ssrLoadModule(resolve(__dirname, "../server/src/handler.ts"));
              await handlerModule.handleApiRequest(req, res, next);
            } catch (err) {
              console.error("[splayer-api-server] Error executing API handler:", err);
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: false, error: String(err) }));
            }
          } else {
            next();
          }
        });
        console.log("[splayer-api-server] API middleware attached to Vite dev server.");
      },
    },
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("@pixi")) {
              return "vendor-pixi";
            }
            if (id.includes("lyric-kit") || id.includes("@applemusic-like-lyrics") || id.includes("lyric-dom")) {
              return "vendor-lyrics";
            }
            if (id.includes("reka-ui")) {
              return "vendor-ui";
            }
            if (id.includes("vue") || id.includes("pinia")) {
              return "vendor-vue";
            }
          }
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
});

