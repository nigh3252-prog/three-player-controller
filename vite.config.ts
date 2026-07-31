import { resolve } from "path";
import { defineConfig } from "vite";

const isVercel = process.env.VERCEL === "1";

export default defineConfig({
    // GitHub Pages hosts this project under /three-player-controller/.
    // Vercel preview deployments are hosted at the domain root.
    base: isVercel ? "/" : "/three-player-controller/",
    root: resolve(__dirname, "example"),
    server: { host: true },
    build: {
        outDir: resolve(__dirname, "docs"),
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: resolve(__dirname, "example", "index.html"),
                gltf: resolve(__dirname, "example", "glTF.html"),
                tiles: resolve(__dirname, "example", "3dtilesScene.html"),
                dgs: resolve(__dirname, "example", "3dgs.html"),
                OfficeBuilding: resolve(__dirname, "example", "OfficeBuilding.html"),
                shooting: resolve(__dirname, "example", "shooting", "shooting.html"),
                footik: resolve(__dirname, "example", "footIK.html"),
            },
        },
    },
});
