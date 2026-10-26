// THE MAIN LOGIC OF THE PROJECT.
//
// a = classes attended (present)
// h = classes held so far (present + absent)
// r = classes remaining = totalClasses - h
// T = totalClasses
// p = minimum attendance as a fraction (75% -> 0.75)
//
// 1) How many classes can I still skip (k)?
//    Final % must stay >= p:   (a + r - k) / T >= p
//    =>  k <= a + r - p*T
//
// 2) If I am below p now, how many classes in a row must I attend (m)?
//    (a + m) / (h + m) >= p
//    =>  m >= (p*h - a) / (1 - p)
//
// We work with whole percentages (75 instead of 0.75) and multiply by 100,
// so every number stays an integer and there are no decimal rounding errors.

function calculateStats({ present, absent, totalClasses, minAttendance }) {
  const a = present;
  const h = present + absent;
  const T = totalClasses;
  const r = Math.max(0, T - h);
  const min = minAttendance; // e.g. 75

  const percentage = h > 0 ? (a / h) * 100 : null; // null = no classes yet

  // k = floor(a + r - p*T), written with integers: (100*(a + r) - min*T) / 100
  const k = Math.floor((100 * (a + r) - min * T) / 100);
  const canReachTarget = k >= 0; // even attending everything else, can I finish at min%?
  const canSkip = Math.max(0, Math.min(k, r));

  // Am I at or above the minimum right now?  a/h >= min/100  <=>  100*a >= min*h
  const meetsNow = h === 0 || 100 * a >= min * h;

  // m = ceil((p*h - a) / (1 - p)), written with integers: (min*h - 100*a) / (100 - min)
  let mustAttend = 0;
  if (!meetsNow && min < 100) {
    mustAttend = Math.ceil((min * h - 100 * a) / (100 - min));
  }

  // Pick a status and a sentence to show the student
  let status;
  let message;
  if (!canReachTarget) {
    status = "unrecoverable";
    message = `Even if you attend all ${r} remaining classes, you cannot reach ${min}%.`;
  } else if (!meetsNow) {
    status = "recovering";
    message = `You are below ${min}%. Attend the next ${mustAttend} classes in a row to get back.`;
  } else if (r === 0) {
    status = "safe";
    message = `Semester done. You finished at or above ${min}%.`;
  } else if (canSkip === 0) {
    status = "tight";
    message = `No margin left. Do not miss the next class.`;
  } else {
    status = "safe";
    message = `You can skip ${canSkip} more ${canSkip === 1 ? "class" : "classes"} and still finish at ${min}%.`;
  }

  return {
    present: a,
    absent,
    held: h,
    remaining: r,
    totalClasses: T,
    minAttendance: min,
    percentage,
    canSkip,
    mustAttend,
    status,
    message,
  };
}

module.exports = calculateStats;
