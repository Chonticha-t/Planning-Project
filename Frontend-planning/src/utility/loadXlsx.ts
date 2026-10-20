let xlsxPromise: Promise<typeof import('xlsx')> | null = null;

export const loadXlsx = () => {
  xlsxPromise ||= import('xlsx');
  return xlsxPromise;
};
