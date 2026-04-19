/** @type {import('next').NextConfig} */
const nextConfig = {
    typescript: {
        ignoreBuildErrors: true,
    },
    // Next.js 16 uses Turbopack by default. Declaring an empty turbopack config
    // suppresses the "webpack config present but no turbopack config" build error.
    turbopack: {},
    // pdf-parse and mammoth require these aliases to work in Next.js webpack
    webpack: (config) => {
        config.resolve.alias = {
            ...config.resolve.alias,
            canvas: false,
            encoding: false,
        };
        return config;
    },
};

export default nextConfig;
