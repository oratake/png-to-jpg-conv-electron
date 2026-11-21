const drop = document.querySelector('#drop');
const status = document.querySelector('#status');
const errors = document.querySelector('#errors');
const quality = document.querySelector('#quality');
const qualityValue = document.querySelector('#qualityValue');
let conversionQueue = Promise.resolve();

quality.addEventListener('input', () => { qualityValue.value = quality.value; });

async function convertPaths(paths) {
  if (!paths.length) return;
  document.body.classList.add('busy');
  errors.replaceChildren();
  status.textContent = `${paths.length}件をスキャン・変換しています…`;
  try {
    const result = await window.converter.convert({
      paths,
      quality: Number(quality.value),
      recursive: document.querySelector('#recursive').checked,
    });
    status.textContent = `検出 ${result.found}枚 / 変換 ${result.converted}枚 / スキップ ${result.skipped}枚 / 失敗 ${result.failed.length}枚`;
    for (const failure of result.failed) {
      const item = document.createElement('li');
      item.textContent = `${failure.path}: ${failure.message}`;
      errors.append(item);
    }
  } catch (error) {
    status.textContent = `変換を開始できませんでした: ${error.message}`;
  } finally {
    document.body.classList.remove('busy');
  }
}

function enqueueConversion(paths) {
  conversionQueue = conversionQueue.then(() => convertPaths(paths));
}

window.converter.onDockFiles(paths => enqueueConversion(paths));

for (const eventName of ['dragenter', 'dragover']) {
  drop.addEventListener(eventName, event => {
    event.preventDefault();
    drop.classList.add('drag');
  });
}
for (const eventName of ['dragleave', 'drop']) {
  drop.addEventListener(eventName, event => {
    event.preventDefault();
    drop.classList.remove('drag');
  });
}
drop.addEventListener('drop', event => {
  const paths = [...event.dataTransfer.files]
    .map(file => window.converter.getPathForFile(file))
    .filter(Boolean);
  if (!paths.length) {
    status.textContent = 'ドロップされたファイルのパスを取得できませんでした。';
    return;
  }
  enqueueConversion(paths);
});
