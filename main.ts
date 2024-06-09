import { Hono } from 'hono';

// @deno-types="https://cdn.sheetjs.com/xlsx-0.20.2/package/types/index.d.ts"
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';

const app = new Hono();

type CodeInfo = {
  code: number;
  pref: string;
  city: string;
};

const getMuniCodes = async () => {
  const xlsxResponse = await fetch('https://www.soumu.go.jp/main_content/000925835.xlsx');
  const xlsxBuffer = await xlsxResponse.arrayBuffer();

  const workbook = XLSX.read(xlsxBuffer);
  const worksheetName = workbook.SheetNames.find((n) => n.includes('現在'));
  const worksheet = workbook.Sheets[worksheetName || 'R6.1.1現在の団体'];
  const contents: string[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  const codeInfo: CodeInfo[] = [];
  const muniCodes: number[] = [];
  contents.forEach((row, i) => {
    if (i !== 0) {
      const code = row[0].slice(0, -1);
      if (!code.endsWith('000')) {
        const pref = row[1];
        const city = row[2];
        codeInfo.push({ code: parseInt(code), pref, city });
        muniCodes.push(parseInt(code));
      }
    }
  });
  return { codeInfo, muniCodes };
};

const { codeInfo, muniCodes } = await getMuniCodes();

type ValidAreaResponse = {
  results: {
    muniCd: string;
    lv01Nm: string;
  };
};

const getAreaCode = async (latitude: string, longtitude: string) => {
  const url = `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${latitude}&lon=${longtitude}`;
  const response = await fetch(url);
  const json = await response.json();
  if ('results' in json) {
    return parseInt((json as ValidAreaResponse).results.muniCd);
  } else return 0;
};

const searchMuniCodes = (code: number) => {
  let left = 0,
    right = muniCodes.length - 1;
  let mid = Math.floor((left + right) / 2);
  while (left <= right) {
    mid = Math.floor((left + right) / 2);
    if (code < muniCodes[mid]) {
      right = mid - 1;
    } else if (code > muniCodes[mid]) {
      left = mid + 1;
    } else {
      return mid;
    }
  }
  return left - 1;
};

app.get('/', (c) => {
  return c.text('Hello Hono!');
});

app.get('/jma_area', async (c) => {
  const { latitude, longtitude } = c.req.query();
  if (!latitude || !longtitude) {
    return c.json({
      success: false,
      error: 'Latitude or longtitude is missing.',
    });
  }
  const muniCode = await getAreaCode(latitude, longtitude);
  if (muniCode === 0)
    return c.json({
      success: false,
      error: 'Could not get area code.',
    });
  const codeIndex = searchMuniCodes(muniCode);
  return c.json({
    success: true,
    code: codeInfo[codeIndex],
  });
});

export default app;
