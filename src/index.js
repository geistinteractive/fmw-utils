import { v4 } from "uuid";
import errors from "./fm-errors";
export const fmErrors = errors;

const CALLBACK = "Fmw_Callback";

/**
 * Waits for FileMaker Object to load and then boots the application with the initialProps.
 * This allows the use of either a merge or function call from FM to kick of an application
 * @param {function} booter the function that will render the application.
 * @param {*} optionalDefaultProps
 * @param {boolean} webDirectRefresh
 */
export function init(
  booter,
  optionalDefaultProps = null,
  webDirectRefresh = "false"
) {
  window.__initialProps__ = "__PROPS__";

  //
  // if we pass in optional defaults use them
  if (optionalDefaultProps) {
    let checkFMInterval = setInterval(() => {
      if (window.FileMaker) {
        clearInterval(checkFMInterval);
        return booter(optionalDefaultProps);
      }
    }, 100);
  }

  //
  // if we have merged in initialProps use them to boot the widget
  if (window.__initialProps__ !== "__PROPS__") {
    try {
      window.__initialProps__ = JSON.parse(window.__initialProps__);
    } catch (error) {}
    window.__initialProps__.webDirectRefresh = webDirectRefresh;
    // we may need to wait for FileMaker
    let checkFMInterval = setInterval(() => {
      if (window.FileMaker) {
        clearInterval(checkFMInterval);
        booter(window.__initialProps__);
      }
    }, 100);
  } else {
    //

    // we haven't merged so install loadInitialProps method for FM to use
    window.loadInitialProps = function (props) {
      try {
        props = JSON.parse(props);
      } catch (error) {
        props = {};
      }
      // boot the widget with those props
      props.webDirectRefresh = webDirectRefresh;
      window.__initialProps__ = props;
      booter(props);
    };
  }
}

/**
 * fetch result queue mapper thing
 * @private
 */
const __FETCH_RESULTS__ = {};
window[CALLBACK] = (results, fetchId) => {
  let x = __FETCH_RESULTS__[fetchId];
  if (x === "started") {
    try {
      results = JSON.parse(results);
    } catch (e) {}
    __FETCH_RESULTS__[fetchId] = results;
  }
};

/**
 *
 * Run a script in FileMaker and return a promise for the result
 *
 * @param {string} script the name of the script to call
 * @param {Object} data the data to pass
 * @param {Object} options
 * @param {Object} [options.Meta] this Optional object is passed to the FileMaker Script in the Meta property.
 * @param {string} [options.Meta.AddonUUID] this is used by some FileMaker Scripts to help target the correct Web Veiwer to call back to
 * @param {Number} [options.timeOut=30000] timeout default is 30000 ms
 * @param {String} [options.eventType=null] an optional top level key to specific different types of events
 * @returns {Promise} a promise
 */
export function fmFetch(script, data = {}, options = { timeOut: 30000 }) {
  const fetchId = v4();
  __FETCH_RESULTS__[fetchId] = "started";

  const Config = getConfigs();
  const AddonUUID = getAddonUUID();

  const param = {
    Data: data,
    Meta: { Config, AddonUUID, FetchId: fetchId, Callback: CALLBACK }
  };
  if (options.eventType) {
    param.Meta.EventType = options.eventType;
  }

  window.FileMaker.PerformScript(script, JSON.stringify(param));

  return new Promise((resolve, reject) => {
    let result = __FETCH_RESULTS__[fetchId];

    let int = setInterval(() => {
      result = __FETCH_RESULTS__[fetchId];
      if (result !== "started") {
        clearInterval(int);
        delete __FETCH_RESULTS__[fetchId];
        resolve(result);
      }
      if (timeOut) {
        clearInterval(int);
        delete __FETCH_RESULTS__[fetchId];
        reject(new Error("timeout"));
      }
    }, 100);

    let timeOut = false;
    setTimeout(() => {
      timeOut = true;
    }, options.timeOut);
  });
}
/**
 *
 * Run a script in FileMaker
 *
 * @param {string} script the name of the script to call
 * @param {Object} data the data to pass
 * @param {Object} [options]
 * @param {Object} [options.Meta] this object is passed to the FileMaker Script in a Meta property
 * @param {string} [options.Meta.AddonUUID] this is used by the FileMaker Script to help target the correct Web Veiwer to call back to
 * @param {String} [options.eventType=null] an optional top level key to specific different types of events
 */

export function fmCallScript(script, data = {}, options = {}) {
  const { Config, AddonUUID } = getInitialProps();
  const param = {
    Data: data,
    Meta: { Config, AddonUUID }
  };
  if (options.Meta) {
    param.Meta = options.Meta;
  }
  if (options.eventType) {
    param.Meta.EventType = options.eventType;
  }

  window.FileMaker.PerformScript(script, JSON.stringify(param));
}

/**
 * returns the entire initial Props object merged into the payload
 * or loaded via function call
 */
export function getInitialProps() {
  return window.__initialProps__ || {};
}

/**
 * get the AddonUUID
 * @returns {string}
 */
export function getAddonUUID() {
  const props = getInitialProps();
  return props.AddonUUID;
}

/**
 * returns the Config part of the intialProps
 */
export const getConfigs = () => {
  const props = getInitialProps();

  return props.Config;
};
/**
 *
 * @param {string} key the ket of the Config to get
 * @returns {string}
 */
export function getConfig(key) {
  const config = getConfigs();
  if (config[key]) return config[key].value;
  throw new Error(`there is no config with the key: ${key}`);
}

/**
 * if the config key is a FM field get just it's name
 * @param {string} key
 * @returns {string}
 */
export function getFMFieldName(key) {
  const fieldValue = getConfig(key);
  if (!fieldValue) return null;
  if (!fieldValue.includes("::"))
    throw new Error(`the key "${key}" doesn't appear to refer to a FM Field`);
  const split = fieldValue.split("::");
  return split[1];
}
/**
 *
 * if the config key is a FM field get just it's table
 * @param {string} key
 * @returns {string}
 */
export function getFMTableName(key) {
  const fieldValue = getConfig(key);
  if (!fieldValue) return null;
  if (!fieldValue.includes("::"))
    throw new Error(`the key "${key}" doesn't appear to refer to a FM Field`);
  const split = fieldValue.split("::");
  return split[0];
}
