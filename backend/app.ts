import express, { Request } from 'express';
import fileUpload, { UploadedFile } from 'express-fileupload';
import fs from 'fs/promises';
import cors from 'cors';

enum Ticker {
  XAUUSD = "XAUUSD",
}

type Trade = {
  tradeNumber: number,
  direction: "long" | "short",
  entry: {
    tvWrongPrice?: number,
    price?: number,
    date: string,
  },
  exit: {
    tvWrongPrice?: number,
    price?: number,
    date: string,
  },
  profit?: number,
  profitPercent?: number,
}

const COLUMN_HEADERS_MAP = {
  "Trade #": "tradeNumber",
  "Type": "type",
  "Signal": "signal",
  "Date/Time": "date",
  "Price USD": "tvWrongPrice",
  "Contracts": "contracts",
  "Profit USD": "profit",
  "Profit %": "profitPercent",
  "Cum. Profit USD": "cumProfit",
  "Cum. Profit %": "cumProfitPercent",
  "Run-up USD": "runUp",
  "Run-up %": "runUpPercent",
  "Drawdown USD": "drawdown",
  "Drawdown %": "drawdownPercent",
}

type Order = {
  tradeNumber: number;
  type: "Exit Short" | "Exit Long" | "Entry Short" | "Entry Long";
  signal: string;
  date: string;
  tvWrongPrice: number;
  contracts: string;
  profit?: string;
  profitPercent?: string;
  cumProfit?: string;
  cumProfitPercent?: string;
  runUp?: string;
  runUpPercent?: string;
  drawdown?: string;
  drawdownPercent?: string;
};

function isDateValid(dateStr: string) {
  return !isNaN(new Date(dateStr).getTime());
}

// Load price data from prices.csv


async function loadPriceData(filePath: string) {
  let priceData = {};
  function csvLinesToCandles(lines, columnHeaders) {
    lines.forEach((line) => {
      const values = line.split(',');
      const rowData = {};
      columnHeaders.forEach((header, index) => {
        rowData[header.trim()] = values[index].trim();
      });

      const dateTimeString = rowData["Gmt time"];
      const isoTimestamp = convertToISO(dateTimeString);
      priceData[isoTimestamp] = {
        open: rowData["Open"],
        high: rowData["High"],
        low: rowData["Low"],
        close: rowData["Close"],
      };
    });
    // console.log(priceData)
    return priceData
  }

  function convertToISO(dateTimeString) {
    //01.11.2023 00:00:00.000 dd.mm.yyyy hh:mm:ss
    const day = dateTimeString.split('.')[0];
    const month = dateTimeString.split('.')[1];
    const year = dateTimeString.split('.')[2].split(' ')[0];
    const time = dateTimeString.split('.')[2].split(' ')[1];
    let timestamp = new Date(`${year}-${month}-${day} ${time}`);
    return timestamp.toISOString();
  }

  try {
    const fileContent = await fs.readFile(filePath, 'utf8');
    const lines = fileContent.split('\n');
    const columnHeaders = lines[0].split(','); // Extract headers
    priceData = csvLinesToCandles(lines.slice(1), columnHeaders);
    console.log('Prices loaded successfully');
    return priceData
  } catch (error) {
    console.error('Error loading prices:', error);
  }
}


function tradingViewCsvToTrades(csv: string) {

  const lines = csv.split('\n');
  const columnHeaders = lines[0].split(','); // Extract headers

  function linesToOrders(lines: string[], columnHeaders: string[]) {
    let orders = []
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',');
      const rowData: { [key: string]: string } = {};

      columnHeaders.forEach((header, index) => {
        rowData[COLUMN_HEADERS_MAP[header]] = row[index];
      });
      orders.push(rowData)
    }
    orders = orders.map((order) => ({
      contracts: Number(order.contracts),
      type: order.type.trim(),
      signal: order.signal.trim(),
      tvWrongPrice: Number(order.tvWrongPrice),
      tradeNumber: Number(order.tradeNumber),
      date: order.date.trim(),
    }))
    return orders
  }

  function ordersToTrades(orders: Order[]): Trade[] {
    const trades = orders.reduce((acc, order) => {
      const tradeNumber = order.tradeNumber;
      const direction = order.type.includes("Long") ? "long" : "short";

      if (!acc[tradeNumber]) {
        acc[tradeNumber] = { entry: null, exit: null, direction, tradeNumber };
      }

      if (order.type.includes("Entry")) {
        acc[tradeNumber].entry = order;
      } else if (order.type.includes("Exit")) {
        acc[tradeNumber].exit = order;
      }
      return acc;
    }, {} as { [key: number]: Trade });

    return Object.values(trades).sort((a: Trade, b: Trade) => a.tradeNumber - b.tradeNumber)
  }

  const orders = linesToOrders(lines, columnHeaders)
  const trades = ordersToTrades(orders)
  return trades
}

function correctTrade(trade: Trade, priceData: { [key: string]: { open: number } }) {
  const { entry, exit } = trade

  if (!entry || !exit || !entry.date || !exit.date) return null
  const entryDateGMT = new Date(entry.date)
  const exitDateGMT = new Date(exit.date)
  entryDateGMT.setSeconds(0, 0)
  exitDateGMT.setSeconds(0, 0)

  const entryDateUTC = new Date(entryDateGMT.getTime() - 3 * 60 * 60 * 1000)
  const exitDateUTC = new Date(exitDateGMT.getTime() - 3 * 60 * 60 * 1000)

  const entryPrice = Number(priceData[entryDateUTC.toISOString()]?.open)
  const exitPrice = Number(priceData[exitDateUTC.toISOString()]?.open)

  if (!entryPrice || !exitPrice) return null

  trade.entry.price = entryPrice
  trade.exit.price = exitPrice

  if (trade.direction === "long") {
    trade.profit = exitPrice - entryPrice
    trade.profitPercent = (exitPrice - entryPrice) / entryPrice
  } else {
    trade.profit = entryPrice - exitPrice
    trade.profitPercent = (entryPrice - exitPrice) / entryPrice
  }

  return trade
}

function calculateProfit(trades: Trade[]) {
  return trades.reduce((acc, trade) => acc + trade.profit, 0)
}

const xauusdPriceData = await loadPriceData('./data/pricesXAUUSD_01-01-2023to17-11-2024.csv')

const app = express();
const PORT = 8000;
app.use(cors());
app.use(express.static('public'));

app.use(fileUpload());
// Endpoint to upload input.csv

// @ts-ignore
app.post('/upload', async (req, res) => {
  if (!req.files || !req.files.input) {
    return res.status(400).send('No input file uploaded');
  }
  let priceData = {}
  if (req.body.ticker === Ticker.XAUUSD) {
    priceData = xauusdPriceData
  }
  else {
    priceData = xauusdPriceData
  }

  const inputFile = req.files.input as UploadedFile
  const csvString = inputFile.data.toString()
  const trades = tradingViewCsvToTrades(csvString)
  const correctedTrades = trades.map((trade) => correctTrade(trade, xauusdPriceData)).filter(Boolean)
  const profit = calculateProfit(correctedTrades)
  return res.send({
    profit,
    trades: correctedTrades,
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// You can run the app using Node.js and access it via http://localhost:3000/upload


