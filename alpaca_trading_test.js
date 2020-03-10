const API_KEY = 'PKL6VCX3KFXQV5D4CQKO';
const API_SECRET = 'bA8pjTP7xI0NELZmCLhXuQf91aXuiShN90oPdQCH';
const PAPER = true;

const cron = require('node-cron');

class Alpaca_Trade {
    constructor(API_KEY, API_SECRET, PAPER) {
        this.Alpaca = require('@alpacahq/alpaca-trade-api');
        this.csvjson = require('csvjson');
        this.readFile = require('fs').readFile;
        this.writeFile = require('fs').writeFile;
        this.alpaca = new this.Alpaca({
            keyId : API_KEY,
            secretKey : API_SECRET,
            paper : PAPER
        });
        
        this.allStocks = [];
        this.bid_start = [ 100, 162.22,181.53,5.81,149.34,76.65,2.325,120.18,39.95,1341.14, 69.29,62.55,1.925,115.86,34.07,82.035,85.56,45.465 ];
        this.start_comp = 0;
        this.start_volume = 100000;
        this.order_size = []
    }

    async run() {
        // read CSV file
        this.allStocks = await this.loadData('./stock.csv');

        // get start_comp value
        await this.alpaca.getBars('minute', 'ZIXI', { limit : 1 }).then(resp => {
            this.start_comp = resp.ZIXI[0].h
        })
        
        // // //GE all stock volumes bid and ask prices
        this.start_bid = [ 100, 162.22,181.53,5.81,149.34,76.65,2.325,120.18,39.95,1341.14, 69.29,62.55,1.925,115.86,34.07,82.035,85.56,45.465 ];
        this.allStocks.forEach(key => {
            this.order_size.push(key.order_size);
        })

        // //Time window is reached
        // // start trading
        // //get current_comp value
        var current_comp = 0;
        await this.alpaca.getBars('minute', 'ZIXI', { limit : 1}).then(resp => {
            current_comp = resp.ZIXI[0].h
        }).catch(err => {})
        console.log('NO')
        if ( this.start_comp > current_comp )
            return true;     

        this.allStocks.forEach(async key => {
            // get stock details
            var bid, ask, volume;
            await this.alpaca.getBars('minute', 'SPY', { limit : 1}).then(resp => {
                bid = resp.SPY[0].h;
                ask = resp.SPY[0].l;
                volume = resp.SPY[0].v;
                console.log(resp)
            }).catch(err => {})

            console.log(bid, ask, volume)

            // await this.alpaca.getPosition().then(resp => {

            //     conso
            //     // if(resp.cost_basis < resp.market_value){
            //     //     side = 'sell';
            //     //     var quantity = resp.qty;
            //     //     await this.submitOrder(quantity, key.symbol, side)
            //     // } else {
            //     //     if(Math.abs( bid - ask ) < .02 && this.start_volume - volume >= key.min_volume && start_bid < bid ){
            //     //         //place buy order place_order_with_stoploss_takeprofit
            //     //         console.log('OK')
            //     //         var side = 'buy';
            //     //         var quantity = 100;
            //     //         var take_profit = key.take_profit;
            //     //         var stop_loss = key.stop_loss;
            //     //         await this.submitOrder(quantity, key.symbol, side, take_profit, stop_loss)   
            //     //     }
            //     // }

            // })
            
            //if active trade

         
        })
    }
        

    loadData(fileName) {
        return new Promise((resolve, reject) => {
          this.readFile(fileName, 'utf8', function (error, datas) {
            if (error) return reject(error);
            datas = datas.split("\r\n");
            var temp = []
            var i = 0
            var jsonData = []
            datas.forEach((data) => {
              data = data.split(",")
              temp.push(data)
              if(i > 0){
                var j = 0
                var jsonObj = {}
                temp[0].forEach(key => {
                  jsonObj[key] = temp[i][j]
                  j++
                })
                jsonData.push(jsonObj)
              }
              i++
            })
            jsonData.pop()
            resolve(jsonData);
          })  
        });
    }

    saveData(filename){
        var fileContent = this.logData
        const csvData = this.csvjson.toCSV(fileContent, {
            headers: 'key'
        });
        this.writeFile(filename, csvData, (err) => {
            if(err) {
                console.log(err); // Do something to handle the error or just throw it
                return false
            }
            console.log('Success!');
            return true
        });
    }

    awaitMarketOpen(){
        var prom = new Promise(async (resolve, reject) => {
          var isOpen = false;
          await this.alpaca.getClock().then(async (resp) => {
            console.log(resp.is_open);
            if(resp.is_open) {
              resolve();
            }
            else {
              var marketChecker = setInterval(async () => {
                await this.alpaca.getClock().then((resp) => {
                  isOpen = resp.is_open;
                  if(isOpen) {
                    clearInterval(marketChecker);
                    resolve();
                  } 
                  else {
                    var openTime = new Date(resp.next_open.substring(0, resp.next_close.length - 6));
                    var currTime = new Date(resp.timestamp.substring(0, resp.timestamp.length - 6));
                    this.timeToClose = Math.floor((openTime - currTime) / 1000 / 60);
                    console.log(this.timeToClose + " minutes til next market open.")
                  }
                }).catch((err) => {console.log(err.error);});
              }, 60000);
            }
          });
        });
        return prom;
    }    

    async getStockInfo(stocks){
        var proms = [];
        stocks.forEach( async stock => {
          proms.push(new Promise(async (resolve, reject) => {
            await this.alpaca.getBars('minute', stock.symbol, {limit: 1}).then( resp => {
              resolve(resp[stock.symbol])
            }).catch((err) => {console.log(err.error);});
          }));
        });
        return await Promise.all(proms)
    }

    getTotalPrice(stocks){
        var proms = [];
        stocks.forEach(async (stock) => {
          proms.push(new Promise(async (resolve, reject) => {
            await this.alpaca.getBars('minute', stock, {limit: 1}).then((resp) => {
              resolve(resp[stock][0].c);
            }).catch((err) => {console.log(err.error);});
          }));
        });
        return proms;
    }

    async submitOrder(quantity, stock, side, take_profit, stop_loss){
        var prom = new Promise(async (resolve,reject) => {
          if(quantity > 0){
            await this.alpaca.createOrder({
                side: "buy",
                symbol: stock,
                type: "market",
                qty: quantity,
                time_in_force: "qty",
                order_class: "bracket",
                take_profit : {
                    limit_price: take_profit
                },
                stop_loss : {
                    stop_price : stop_loss,
                }
            }).then(() => {
              console.log("Market order of | " + quantity + " " + stock + " " + side + " | completed.");
              resolve(true);
            }).catch((err) => {
              console.log("Order of | " + quantity + " " + stock + " " + side + " | did not go through.");
              resolve(false);
            });
          }
          else {
            console.log("Quantity is <=0, order of | " + quantity + " " + stock + " " + side + " | not sent.");
            resolve(true);
          }
        });
        return prom;
    }

}

var trade = new Alpaca_Trade(API_KEY, API_SECRET, PAPER);

cron.schedule('* 0-59 10-23 * * *', function(){
    trade.run();
})


