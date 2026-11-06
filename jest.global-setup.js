// Pin the timezone so wall-clock formatting in report tests is deterministic.
module.exports = async () => {
  process.env.TZ = 'UTC';
};
