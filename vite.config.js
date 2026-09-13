import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { handleMembersApi } from "./server/members.js";

function membersApi() {
  return {
    name: "members-api",
    configureServer(s) {
      s.middlewares.use(handleMembersApi);
    },
    configurePreviewServer(s) {
      s.middlewares.use(handleMembersApi);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), membersApi()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
