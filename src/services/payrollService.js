const sumValues = (obj = {}) =>
  Object.values(obj).reduce((acc, v) => acc + (Number(v) || 0), 0);

const computeNetSalary = (structure, bonus = 0) => {
  const allowancesTotal = sumValues(structure.allowances);
  const deductionsTotal = sumValues(structure.deductions);
  const netSalary =
    Number(structure.basic || 0) + allowancesTotal + Number(bonus || 0) - deductionsTotal;

  return {
    basic: structure.basic,
    allowancesTotal,
    deductionsTotal,
    bonus: Number(bonus || 0),
    netSalary,
    breakdown: {
      allowances: structure.allowances,
      deductions: structure.deductions,
    },
  };
};

export { computeNetSalary, sumValues };
