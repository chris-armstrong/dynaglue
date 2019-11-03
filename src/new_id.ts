// Code adapted from https://github.com/mongodb/js-bson/blob/master/lib/objectid.js
// License: Apache License 2.0

import { randomBytes } from 'crypto';

const PROCESS_UNIQUE = randomBytes(5);
let IdIndex = ~~(Math.random() * 0xffffff);
const getInc = () => (IdIndex = (IdIndex + 1) % 0xffffff);

const newId = () => {
  const time = ~~(Date.now() / 1000);

  const inc = getInc();
  const buffer = Buffer.alloc(12);

  // 4-byte timestamp
  buffer[3] = time & 0xff;
  buffer[2] = (time >> 8) & 0xff;
  buffer[1] = (time >> 16) & 0xff;
  buffer[0] = (time >> 24) & 0xff;

  // 5-byte process unique
  buffer[4] = PROCESS_UNIQUE[0];
  buffer[5] = PROCESS_UNIQUE[1];
  buffer[6] = PROCESS_UNIQUE[2];
  buffer[7] = PROCESS_UNIQUE[3];
  buffer[8] = PROCESS_UNIQUE[4];

  // 3-byte counter
  buffer[11] = inc & 0xff;
  buffer[10] = (inc >> 8) & 0xff;
  buffer[9] = (inc >> 16) & 0xff;

  return buffer.toString('hex');
}

export default newId;
