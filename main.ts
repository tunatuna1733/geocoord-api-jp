import { Hono } from 'hono';

// @deno-types="https://cdn.sheetjs.com/xlsx-0.20.3/package/types/index.d.ts"
// deno-lint-ignore no-import-prefix
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';

const app = new Hono();

type JmaAreaResponse = {
  centers: {
    [C: string]: JmaCenterData;
  };
  offices: {
    [C: string]: JmaOfficeData;
  };
  class10s: {
    [C: string]: JmaClass10Data;
  };
  class15s: {
    [C: string]: JmaClass15Data;
  };
  class20s: {
    [C: string]: JmaClass20Data;
  };
};

type JmaBaseData = {
  name: string;
  enName: string;
};

type JmaCenterData = JmaBaseData & {
  officeName: string;
  children: string[];
};

type JmaOfficeData = JmaCenterData & {
  parent: string;
};

type JmaClass10Data = JmaBaseData & {
  parent: string;
  children: string[];
};

type JmaClass15Data = JmaClass10Data;

type JmaClass20Data = JmaBaseData & {
  kana: string;
  parent: string;
};

type CodeInfo = {
  office_code: number;
  class10s_code: number;
  pref: string;
  city: string;
};

const getMuniCodes = async () => {
  const jmaAreaResponse = await fetch('https://www.jma.go.jp/bosai/common/const/area.json');
  const jmaArea: JmaAreaResponse = await jmaAreaResponse.json();

  const xlsxResponse = await fetch('https://www.soumu.go.jp/main_content/000925835.xlsx');
  const xlsxBuffer = await xlsxResponse.arrayBuffer();

  const workbook = XLSX.read(xlsxBuffer);
  const worksheetName = workbook.SheetNames.find((n: string) => n.includes('現在'));
  const worksheet = workbook.Sheets[worksheetName || 'R6.1.1現在の団体'];
  const contents = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown as string[][];
  const codeInfo: CodeInfo[] = [];
  const muniCodes: number[] = [];
  contents.forEach((row, i) => {
    if (i !== 0) {
      const code = row[0].slice(0, -1);
      if (!code.endsWith('000')) {
        const pref = row[1];
        const city = row[2];
        // search `code${00}` in class20s
        const target20Code = code + '00';
        let code15 = '';
        Object.entries(jmaArea.class20s).forEach(([c20Code, areaData]) => {
          if (c20Code === target20Code) {
            code15 = areaData.parent;
          }
        });
        if (code15 === '') return;
        let code10 = '';
        Object.entries(jmaArea.class15s).forEach(([c15Code, areaData]) => {
          if (c15Code === code15) {
            code10 = areaData.parent;
          }
        });
        if (code10 === '') return;
        let officeCode = '';
        Object.entries(jmaArea.class10s).forEach(([c10Code, areaData]) => {
          if (c10Code === code10) {
            officeCode = areaData.parent;
          }
        });
        if (officeCode === '') return;
        codeInfo.push({ office_code: parseInt(officeCode), class10s_code: parseInt(code10), pref, city });
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

const getAreaCode = async (latitude: string, longitude: string) => {
  const url = `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${latitude}&lon=${longitude}`;
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
  const { latitude, longitude } = c.req.query();
  if (!latitude || !longitude) {
    return c.json({
      success: false,
      data: {
        error: 'Latitude or longitude is missing.',
      },
    });
  }
  const muniCode = await getAreaCode(latitude, longitude);
  if (muniCode === 0)
    return c.json({
      success: false,
      data: {
        error: 'Could not get area code.',
      },
    });
  const codeIndex = searchMuniCodes(muniCode);
  return c.json({
    success: true,
    data: {
      code: codeInfo[codeIndex],
    },
  });
});

export default app;
