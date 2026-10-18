// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-check
const fs = require('fs');
const path = require('path');
const https = require('https');
const unzip = require('unzip-crx-3');
const { elfen } = require('../package.json');

const extensionID = elfen.devtoolsId;
const chromiumVersion = '124';
const destFolder = path.resolve(__dirname, `../misc/${extensionID}`);
const filePath = path.resolve(__dirname, `${destFolder}/${extensionID}.crx`);
const temporaryFilePath = `${filePath}.tmp`;
const fileUrl = `https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx2,crx3&x=id%3D${extensionID}%26uc&prodversion=${chromiumVersion}`;

if (!fs.existsSync(destFolder))
   fs.mkdirSync(destFolder, { recursive: true });

const downloadFile = (url, redirectCount = 0) => {
   if (redirectCount > 5)
      return Promise.reject(new Error('Too many redirects while downloading DevTools'));

   return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
      const request = https.get(url, response => {
         if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
            const location = response.headers.location;
            response.resume();

            if (!location) {
               reject(new Error(`DevTools download redirected without a location (HTTP ${response.statusCode})`));
               return;
            }

            downloadFile(new URL(location, url).toString(), redirectCount + 1)
               .then(resolve)
               .catch(reject);
            return;
         }

         if (response.statusCode !== 200) {
            response.resume();
            reject(new Error(`DevTools download failed with HTTP ${response.statusCode}`));
            return;
         }

         const fileStream = fs.createWriteStream(temporaryFilePath);
         response.pipe(fileStream);
         response.on('error', reject);
         fileStream.on('error', reject);
         fileStream.on('finish', () => {
            fileStream.close(error => error ? reject(error) : resolve());
         });
      });

      request.on('error', reject);
   }));
};

(async () => {
   try {
      if (fs.existsSync(temporaryFilePath))
         fs.unlinkSync(temporaryFilePath);

      await downloadFile(fileUrl);
      fs.renameSync(temporaryFilePath, filePath);
      await unzip(filePath, destFolder);
      fs.unlinkSync(filePath);
      fs.unlinkSync(`${destFolder}/package.json`);// <- Avoid to display annoyng npm script in vscode
      console.log('Devtools download completed!');
   }
   catch (error) {
      if (fs.existsSync(temporaryFilePath))
         fs.unlinkSync(temporaryFilePath);
      console.error(error);
      process.exitCode = 1;
   }
})();
