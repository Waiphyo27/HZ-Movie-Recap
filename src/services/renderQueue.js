const queue = [];
let isProcessing = false;

function processQueue() {
  if (isProcessing) return;
  const next = queue.shift();
  if (!next) return;

  isProcessing = true;
  if (next.onStart) next.onStart();

  next
    .taskFn()
    .then((result) => next.resolve(result))
    .catch((err) => next.reject(err))
    .finally(() => {
      isProcessing = false;
      processQueue();
    });
}

function enqueueRender(taskFn, onStart) {
  return new Promise((resolve, reject) => {
    queue.push({ taskFn, resolve, reject, onStart });
    processQueue();
  });
}

function getQueueLength() {
  return queue.length;
}

module.exports = { enqueueRender, getQueueLength };