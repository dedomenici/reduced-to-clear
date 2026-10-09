const config = require('./src/config');
const { createApp } = require('./src/app');
createApp().then(app => {
  app.listen(config.port, () => console.log(`Reduced to Clear running on http://localhost:${config.port}`));
});
