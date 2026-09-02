const SCALAR_CDN = "https://cdn.jsdelivr.net/npm/@scalar/api-reference";

export const scalarPage = `<!doctype html>
<html lang="en">
  <head>
    <title>AIPass Proxy</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <div id="app"></div>
    <script src="${SCALAR_CDN}"></script>
    <script>
      Scalar.createApiReference('#app', { url: '/openapi.json' })
    </script>
  </body>
</html>
`;
