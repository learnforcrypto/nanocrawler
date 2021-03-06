const fs = require("fs");
const util = require("util");
const redis = require("redis").createClient();
const scan = util.promisify(redis.scan).bind(redis);
const get = util.promisify(redis.get).bind(redis);

const stream = fs.createWriteStream("timestamps.csv");
const HASH_REGEX = /^block_timestamp\/([A-F0-9]{64})$/;

async function fetchNext(cursor) {
  const resp = await scan(
    cursor,
    "MATCH",
    "block_timestamp/*",
    "COUNT",
    "1000"
  );
  const nextCursor = resp[0];
  const keys = resp[1];

  const outputString = await getTimestamps(keys);
  stream.write(outputString, "utf-8");

  if (resp[0] === "0") {
    console.log("Done!");
    stream.end();
    return;
  }

  fetchNext(nextCursor);
}

async function getTimestamps(keys) {
  const filteredKeys = keys.filter(key => HASH_REGEX.test(key));

  return new Promise((resolve, reject) => {
    let returnValue = [];
    redis.multi(filteredKeys.map(key => ["get", key])).exec((err, replies) => {
      if (err) return resolve([]);

      filteredKeys.forEach((key, index) => {
        const hash = key.match(/^block_timestamp\/([A-F0-9]{64})/)[1];
        returnValue.push([hash, replies[index]].join(","));
      });

      resolve(returnValue.join("\n"));
    });
  });
}

stream.write("hash,timestamp\n", "utf-8");
fetchNext(0);
