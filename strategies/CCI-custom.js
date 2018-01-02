// helpers
var _ = require('lodash');
var log = require('../core/log.js');
var trader = require('../plugins/trader/trader.js');

// let's create our own method
var method = {};

// prepare everything our method needs
method.init = function() {
  this.currentTrend;
  this.requiredHistory = this.tradingAdvisor.historySize;

  this.age = 0;
  this.trend = {
    direction: 'undefined',
    duration: 0,
    persisted: false,
    adviced: false
  };
  this.historySize = this.settings.history;
  this.ppoadv = 'none';
  this.uplevel = this.settings.thresholds.up;
  this.downlevel = this.settings.thresholds.down;
  this.persisted = this.settings.thresholds.persistence;

  ///////////////////////////////////////////////////////////////////////
  // Experimental
  // Safety: boolean (0 or 1)
  //   Do not take a loss on any trade
  //   Future: deal with a persistent trend in a direction somehow and take the safety off in the case of certain type of market
  this.safety = this.settings.safety;
  // Minimum Profit: percentage in decimal format (value between 0-1)
  this.minProfit = this.settings.minProfit;

  // Variables for tracking round trips and profits
  this.roundTrip = {
    entry: false,
    exit: false
  }

  this.trades = 0;
  //
  //////////////////////////////////////////////////////////////////////

  log.info('Setting up Strategy CCI Custom:');
  log.info('\tSafety: ', this.safety);
  log.info('\tMinimum Profit: ', this.minProfit);
  log.info('\tCCI Params:');
  log.info('\t\tHistory: ', this.historySize);
  log.info('\t\tThresholds: ');
  log.info('\t\t\tUp: ', this.uplevel);
  log.info('\t\t\tDown: ', this.downlevel);
  log.info('\t\t\tPersistence: ', this.persisted);


  // log.debug("CCI started with:\nup:\t", this.uplevel, "\ndown:\t", this.downlevel, "\npersistence:\t", this.persisted);
  // define the indicators we need
  this.addIndicator('cci', 'CCI', this.settings);
}

method.update = function(candle) {
}

// what happens on every new trade?
method.onTrade = function(trade) {
  this.trades++;
  if(this.trades === 1 && trade.action === 'sell') {
    log.info('Started on asset side of trading, round trip and profit calculation will start on next trade!');
    return;
  }
  if(trade.action === 'buy') {
    log.debug('Round Trip Started!');
    this.roundTrip.entry = {
      date: trade.date,
      price: trade.price,
      total: trade.portfolio.asset * trade.price,
    }
  } else if(trade.action === 'sell') {
    log.debug('Round Trip Ended!');
    this.roundTrip.exit = {
      date: trade.date,
      price: trade.price,
      total: trade.portfolio.currency
    }
    // Unset round trip entry
    this.roundTrip.entry = false;
  }
}

// for debugging purposes: log the last calculated
// EMAs and diff.
method.log = function(candle) {
    var cci = this.indicators.cci;
    if (typeof(cci.result) == 'boolean') {
        log.debug('Insufficient data available. Age: ', cci.size, ' of ', cci.maxSize);
        log.debug('ind: ', cci.TP.result, ' ', cci.TP.age, ' ', cci.TP.depth);
        return;
    }

    log.debug('calculated CCI properties for candle:');
    log.debug('\t', 'Price:\t\t', candle.close.toFixed(8));
    log.debug('\t', 'CCI tp:\t', cci.tp.toFixed(8));
    log.debug('\t', 'CCI tp/n:\t', cci.TP.result.toFixed(8));
    log.debug('\t', 'CCI md:\t', cci.mean.toFixed(8));
    if (typeof(cci.result) == 'boolean' )
        log.debug('\t In sufficient data available.');
    else
        log.debug('\t', 'CCI:\t\t', cci.result.toFixed(2));
}

/*
 *
 */
method.check = function(candle) {

    var price = candle.close;

    this.age++;
    var cci = this.indicators.cci;
    var buyPrice = false;
    var profit = false;

    if(this.roundTrip.entry) {
      buyPrice = this.roundTrip.entry.price;
      profit = ((price - buyPrice) / price);
    }

	// short = sell asset
    // long  = buy asset
    
    if (typeof(cci.result) == 'number') {

        // overbought?
        if (cci.result >= this.uplevel && (this.trend.persisted || this.persisted == 0) && !this.trend.adviced && this.trend.direction == 'overbought' ) {
            this.trend.adviced = true;
            this.trend.duration++;
            if(this.roundTrip.entry) {
              if(price > buyPrice && profit > this.minProfit && this.safety === 1) {
                this.advice('short');
                log.info('Advice: SELL!');
                log.info('Buy Price:\t', buyPrice);
                log.info('Sell Price:\t', price);
                log.info('Trade Profit:\t', (profit*100).toFixed(2), '%');
              } else if (this.safety === 0) {
                log.info('CCI Says to SELL!');
                log.info('Sell conditions are NOT met but the SAFETY is OFF!');
                log.info('Buy Price:\t', buyPrice);
                log.info('Proposed Sell Price:\t', price);
                log.info('Proposed Profit:\t', (profit*100).toFixed(2), '%');
                this.advice('short');
              } else {
                log.info('CCI Says to SELL!');
                log.info('Sell conditions are NOT met and SAFETY is ON!');
                log.info('TRADE WILL NOT EXECUTE!');
                log.info('Buy Price:\t', buyPrice);
                log.info('Proposed Sell Price:\t', price);
                log.info('Proposed Profit:\t', (profit*100).toFixed(2), '%');
                log.info('Required Profit:\t', (this.minProfit*100).toFixed(2), '%');
                this.advice();
              }
            } else if (this.trades <= 1 ) {
                this.advice('short');
            }
        } else if (cci.result >= this.uplevel && this.trend.direction != 'overbought') {
            this.trend.duration = 1;
            this.trend.direction = 'overbought';
            this.trend.persisted = false;
            this.trend.adviced = false;
            if (this.persisted == 0) {
            }
        } else if (cci.result >= this.uplevel) {
            this.trend.duration++;
            if (this.trend.duration >= this.persisted) {
                this.trend.persisted = true;
            }
        } else if (cci.result <= this.downlevel && (this.trend.persisted || this.persisted == 0) && !this.trend.adviced && this.trend.direction == 'oversold') {
            this.trend.adviced = true;
            this.trend.duration++;
            this.advice('long');
        } else if (cci.result <= this.downlevel && this.trend.direction != 'oversold') {
            this.trend.duration = 1;
            this.trend.direction = 'oversold';
            this.trend.persisted = false;
            this.trend.adviced = false;
            if (this.persisted == 0) {
                this.trend.adviced = true;
                this.advice('long');
            }
        } else if (cci.result <= this.downlevel) {
            this.trend.duration++;
            if (this.trend.duration >= this.persisted) {
                this.trend.persisted = true;
            }
        } else {
            if( this.trend.direction != 'nodirection') {
                this.trend = {
                    direction: 'nodirection',
                    duration: 0,
                    persisted: false,
                    adviced: false
                };
            } else {
                this.trend.duration++;
            }
            this.advice();
        }

    } else {
        this.advice();
    }

    log.debug("Trend: ", this.trend.direction, " for ", this.trend.duration);
}

module.exports = method;
