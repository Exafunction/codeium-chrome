const path = require('path');

const DotenvPlugin = require('dotenv-webpack');
const ESLintPlugin = require('eslint-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const { DefinePlugin } = require('webpack');

/**@type {(env: any) => import('webpack').Configuration}*/
module.exports = (env) => ({
  entry: {
    serviceWorker: './src/serviceWorker.ts',
    contentScript: './src/contentScript.ts',
    popup: './src/popup.tsx',
    options: './src/options.tsx',
    // This script is loaded in contentScript.ts.
    script: './src/script.ts',
  },
  module: {
    rules: [
      {
        test: /\.(js|ts)x?$/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-react', '@babel/preset-env', '@babel/preset-typescript'],
          },
        },
        exclude: /node_modules/,
      },
      {
        test: /\.(scss|css)$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader'],
      },
      {
        test: /\.svg$/,
        loader: 'svg-inline-loader',
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, env.enterprise ? 'dist_enterprise' : 'dist'),
    clean: true,
  },
  externals: { 'monaco-editor': 'monaco' },
  plugins: [
    new DotenvPlugin(),
    new ESLintPlugin({
      extensions: ['js', 'ts'],
      overrideConfigFile: path.resolve(__dirname, '.eslintrc'),
    }),
    new MiniCssExtractPlugin({
      filename: 'styles/[name].css',
    }),
    new CopyPlugin({
      patterns: [
        {
          from: 'static',
          transform: (content, resourcePath) => {
            if (!env.enterprise) {
              return content;
            }
            if (!resourcePath.endsWith('manifest.json')) {
              return content;
            }
            const manifest = JSON.parse(content.toString());
            manifest.name = 'Codeium Enterprise';
            return JSON.stringify(manifest);
          },
        },
      ],
    }),
    new DefinePlugin({
      CODEIUM_ENTERPRISE: JSON.stringify(env.enterprise),
    }),
  ],
  experiments: {
    topLevelAwait: true,
  },
});
