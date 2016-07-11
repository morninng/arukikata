(function() {
	window['__putPixel'] = window['__putPixel'] || function(){};
	window['__putPixel'](300300);
	// global link to lib (to make it accessible from outside)
	var aslGlobalName = '<LIB_CONTEXT_LINK>';
	if (typeof window[aslGlobalName] !== 'undefined'){return;} // lib already initialized

// ----------------------------------------------------------------------
// ######## SHOWAD LIB MACRO AND NON-MACRO PARAMS SETTING BEGINS ########
// ----------------------------------------------------------------------
	var AD_SERVER_URL = '<AD_SERVER_URL>'; // ad server URL
    var AD_SERVER_PREVIEW_URL = '<AD_SERVER_PREVIEW_URL>'; // ad server preview URL

	// ad server response handling function, this fn name goes to ad server and returns back
	var SERVER_RESPONSE_HANDLER_NAME = '<SERVER_RESPONSE_HANDLER_NAME>';
	var SLOT_ID_PREFIX = '<SLOT_ID_PREFIX>'; // string that is added to slot id, giver by ad server
	var SLOT_SECTION_ID_DELIMITER = '<SLOT_SECTION_ID_DELIMITER>'; // slot id now consists of slot inernal id + section id
	var globalLinkName = '<PAGE_CONTEXT_LINK>'; // name of variable, that defined as 'host' in 'head' (lib definition) part
	if ( typeof window[globalLinkName] === 'undefined' ){
		// this is the worst case, this means that lib was not initialized on page side
		window['__putPixel'](300666, false, 'Global linking has failed');
		return; // TODO: handle error?
	}
    if (typeof QUnit !== 'undefined'){
        // export
        window.SLOT_ID_PREFIX = SLOT_ID_PREFIX;
        window.SLOT_SECTION_ID_DELIMITER = SLOT_SECTION_ID_DELIMITER;
        window.globalLinkName = globalLinkName;
    }
// ----------------------------------------------------------------------
// ######## SHOWAD LIB MACRO AND NON-MACRO PARAMS SETTING ENDS ########
// ----------------------------------------------------------------------


// ----------------------------------------------------------------------
// ######## DMP LIB MACRO AND NON-MACRO PARAMS SETTING BEGINS ########
// ----------------------------------------------------------------------
	var DMP_URL = '<DMP_URL>';
	var __DMP_OID = '<DMP_OID>';
	var __DMP_SEG_COOKIE_NAME = '<DMP_SEG_COOKIE_NAME>';
	var __DMP_SEG_COOKIE_PREFIX = '<DMP_SEG_COOKIE_PREFIX>';
	var __DMP_TIME = '<DMP_TIME>';
	var __DMP_PROCESSING_CALLBACK_FN_NAME = '<DMP_PROCESSING_CALLBACK_FN_NAME>';
// ----------------------------------------------------------------------
// ######## DMP LIB MACRO AND NON-MACRO PARAMS SETTING ENDS ########
// ----------------------------------------------------------------------


// ----------------------------------------------------------------------
// ######## AD DELIVERY LIB INITIALIZATION AND SETUP BEGINS ########
// ----------------------------------------------------------------------

	// setup inheritance. AdBase must be prototype for both our classes
	// it contains only basic functions, which I want to be accessible from
	// manager and renderer
	AdManager.prototype = new AdBase();
	AdManager.prototype.constructor = AdManager;
	AdRenderer.prototype = AdManager.prototype;
	AdRenderer.prototype.constructor = AdRenderer;

	// create instance
	var adManager = new AdManager( window[globalLinkName] );
	// init DMP
	initDmpHandler();
	// request data, that's all
	//adManager.requestAdServiceData();
	window[aslGlobalName] = adManager;
	adManager.processStack();

// ----------------------------------------------------------------------
// ######## AD DELIVERY LIB INITIALIZATION AND SETUP ENDS ########
// ----------------------------------------------------------------------


// below is ad delivery lib source code

	/**
	 * Instance of this class rules server request and processing.
	 * It creates real displayAd function, which is called on ad tag render
	 * or server response receiving.
	 * @class AdManager
	 * @extends AdBase
	 * @param {Object} linkToGlobalPart
	 */
	function AdManager(linkToGlobalPart) {
		var me = this;
		this['version'] = '<LIB_VERSION>';
		/**
		 * Links AdManager to global object.
		 * @property {Object} globalPart
		 */
		this.globalPart = linkToGlobalPart;

		/**
		 * Holds already displayed ad slots. Maps sectionId key to hash of slots
		 * {
		 *	sectionId1: {
		 *		slotId1: 1,
		 *		slotId2: 1,
		 *		...
		 *	}
		 *	...
		 * }
		 * Is cleared (per section) when section request is sent
		 * @property {Object} displayedAds
		 */
		this.displayedAds = {};
		/**
		 * Slots data storage
		 * {
		 *		section1:
		 *			slot1,
		 *			slot2
		 *		section2:
		 *			slot1
		 *			slot2
		 *		...
		 * }
		 */
		this.serverSlotsDef = {};
		/**
		 * Link between AdManager and AdRenderer
		 * @property {AdRenderer} adRenderer
		 */
		this.adRenderer = new AdRenderer(this);
		/**
		 * Property to watch if DMP call is being done now
		 * @property {Boolean}
		 */
		this.dmpIsLoading = false;
		/**
		 * Array of segments. Gets filled with DMP
		 * @property {Array}
		 */
		this.segments = [];
		/**
		 * Object (hash) of some params (key:value) received from DMP
		 * @property {Object}
		 */
		this.dmpParams = {};
		/**
		 * Hash (object) ->
		 * {key - %some id%, value - requestAdService fn with attached params}
		 * The goal is to have some hash of functions:
		 * This function will run after DMP callback is processed. Empty by default.
		 * Typical usage is assigning requestAdService method with attached original params as argument
		 * to this propertty, if so - requestAdService will run after DMP (if time is ok) with proper arguments
		 * Done for multisection
		 * ID is required to be able to remove these objects and callback functions when DMP is expired
		 * @property {Function[]|null|Array}
		 * @returns {undefined}
		 */
		this.dmpFinishCallbackFns = {};
		/**
		 * Array of expire timers to clear them on processDMP method finish
		 */
		this.dmpExpireTimers = [];
		/**
		 * Maximum time (in milliseconds) that is available to make DMP call.
		 * Notice that this time is counted since our library loads and starts to work.
		 * It doesn't depend on DMP head snippet loading and executing. So be careful.
		 * In other words, if DMP loads synchronously, this time will be ignored, 'cause
		 * DMP loading will block the page and other scripts.
		 * @property {Number} maxDmpTime
		 */
		this.maxDmpTime = parseInt(__DMP_TIME || 200, 10);
		/**
		 * Page id; is sent to ad server with every request to help it understand
		 * that requests come from one instance of adManager (one page session)
		 * @property {String}
		 * @readonly
		 */
		this.pid = this.genPageId();
		this.globalPart['displayAd'] = function(slotId, plainSectionId, slotDef){
			var slotData = slotDef;
			if (!slotDef){
				slotData = me.getSlotDefById(slotId, plainSectionId);
			}

			// if arguments are bad or slot is displayed or there is no slot data - exit
			if ( !me.notEmptyVar(slotId) || !me.serverSlotsDef || !slotData || me.slotIsDisplayed(slotData) ){
				return;
			}
			if ( me.adRenderer.renderSlot(slotData) ){
				me.setSlotIsDisplayed(true, slotData);
			}
		};

		/**
		 * Main displaying function.
		 * @param {String} slotId
		 * @param {Object} [slotDef]
		 */
		this.displayAd = this.globalPart['displayAd'];

		this.globalPart['processDmp'] = function(segs, pigs){
			me.dmpIsLoading = false; // DMP loading flag
			me.isDmpProcessed = true; // DMP processed flag
			var finalRes = {},
				knownDmpParams = ['gender_age', 'home_location', 'occupation', 'work_location'],
				dmpParam, segments, hasDmpParams;
			// detect answer structure
			// RT355100: no more gender_age
			hasDmpParams = false; // no additional params, such as gender_age are received
			segments = segs;
			me.segments = segments; // store segments
			me.dmpParams = finalRes; // store DMP params (known)
			me.onDmpProcessed(); // launch DMP processing complete handler
		};

		/**
		 * DMP answer processing method can be run from global DMP call handler
		 * or from requestAdService method
		 * @param {Object} dmpResult
		 */
		this.processDmp = this['processDmp'] = this.globalPart['processDmp'];
		/**
		 * Method should search for not loaded yet section inside 'stack' and load them.
		 * Is called after lib initialization
		 * @returns {undefined}
		 */
		this.processStack = function(){
			if ( window['__ASL_USE_DMP'] && !me.dmpIsLoading ){
				// page can contain special global variable flag, which should
				// initiate DMP request (if not loading already)
				// 'regular' way to launch DMP request is to call 'requestAds' with
				// appropriate options object
				!me.dmpIsLoading && makeDmpCall(!!window['__ASL_DMP_SYNC']);
			}
			var stack = (this.globalPart && this.globalPart.stack) || {};
			// stack is being iterated, and 'requestAds' is called on every its property
			// property is a key equal to section id and value is request params object (dmp, custom, etc...)
			// this functionality is used in async mode, because there's no lib and no lib code when
			// sections are calling to 'requestAds', instead they store request params in stack.
			// After lib is loaded, processStack is called.
			for ( var plainSectionId in stack ){
				if ( stack.hasOwnProperty(plainSectionId + '') ){
					plainSectionId = parseInt(plainSectionId, 10);
					this.requestAds(stack[plainSectionId]); // request ad is called
					delete stack[plainSectionId];
				}
			}
		};
		/**
		 * @param {Object} [params]
		 * @param {String|Number} [params.sectionId]
		 * @returns {undefined}
		 */
		// function has to be accessible from outside (has non-minified name)
		this.requestAds = this['requestAds'] = function(params){
			// notice that params object is given from outside, consider this fact
			// and presence of closure complier minification, when working with it
			params = params || {};
			var callbackId;
			delete me.displayedAds[ params['sectionId'] ]; // clear from displayed list
			delete me.serverSlotsDef[ params['sectionId'] ];
			this.sectionInfo[ params['sectionId'] ] = params;
			// if DMP is used and DMP is not already processed and is not currently loading
			if (!!params['dmp'] && !me.isDmpProcessed){
				log('set callback');
				// call DMP if not called yet
				!me.dmpIsLoading && makeDmpCall( params['sync'] );
				// attach DMP finish callback handler, which is simply requestAdService method, rewrite same sections
				// it is safe for sync mode, cause sync DMP is document.write
				callbackId = params['sectionId'];
				me.dmpFinishCallbackFns[callbackId] = me.requestAdServiceData.bind(me, params);
				// IT IS IMPOSSIBLE TO SET EXPIRE CALLBACK FOR SYNC MODE.
				// Sync mode requires page flow to not be changed.
				if ( !params['sync'] ){
					// attach DMP expiration callback
					me.dmpExpireTimers.push(setTimeout(this.onDmpExpire.bind(this, callbackId, params), this.maxDmpTime));
				}
			}else{
				params['dmp'] && log('make a call');
				this.requestAdServiceData(params);
			}
		};
		/**
		 * DMP expiration callback, this is also a requestAdService call, but
		 * with one little addition - it removes DMP finish callback, so totally
		 * it launches adService call and denies double adService call
		 * @param {String} handlerId
		 * @param {Object} requestParams
		 * @returns {undefined}
		 */
		this.onDmpExpire = function(handlerId, requestParams){
			log('DMP expire callback is called');
			me.dmpFinishCallbackFns = me.dmpFinishCallbackFns || {};
			if ( handlerId in me.dmpFinishCallbackFns ){
				// clear callback, it has no chance to run, because it's too late
				try {
					delete me.dmpFinishCallbackFns[handlerId];
				} catch(err) {
					me.dmpFinishCallbackFns[handlerId] = undefined;
				}

			}
			me.requestAdServiceData(requestParams);
		};
		/**
		 * Call adserver.
		 * @param {Object} [params]
		 * @param {String|Number} [parmas.sectionId]
		 */
		this.requestAdServiceData = function(params){
			var dmpRes = window['__DMP_RESULT'];
			if ( !!params['dmp'] ){
				if ( dmpRes && !me.isDmpProcessed ){
					me.processDmp(dmpRes['r1'], dmpRes['r2'], params);
					return;
				}else{
					sendRequest(params);
					return;
				}
			}else{
				sendRequest(params);
			}
		};

		/**
		 * Request to ad server.
		 * @param {Object} [params]
		 * @param {String|Number} [parmas.sectionId]
		 */
		function sendRequest(params) {
			// notice that params object is given from outside, consider this fact
			// and presence of closure complier minification, when working with it
			log('server request sent: ' + params['sectionId']);
			var scriptEl, scriptTag, firstScriptNode, completeAdServerUrl, sectionId;

			completeAdServerUrl = me.generateAdServerUrl(params);

			log('Ad server full URL: ' + completeAdServerUrl);

			// sync request
			if ( me.isSyncMode(params['sectionId']) === true ){
				scriptTag = '\x3Cscript type=\"text/javascript\" src=\"{{url}}\">\x3C\/script>';
				scriptTag = scriptTag.replace('{{url}}', completeAdServerUrl);
				document.write(scriptTag);
				window['__putPixel'](300500, params['sectionId'] ? params['sectionId'] : false);
				return true;
			}

			// async request
			scriptEl = document.createElement('script');
			scriptEl.async = true;
			scriptEl.type = 'text/javascript';
			scriptEl.src = completeAdServerUrl;
			// we have at least one script tag, because of ours head snippet
			firstScriptNode = document.getElementsByTagName('script')[0];

			if ( me.isPresto() ){
				setTimeout(function(){
					firstScriptNode.parentNode.insertBefore(scriptEl, firstScriptNode);
					window['__putPixel'](300500, params['sectionId'] ? params['sectionId'] : false);
				}, 0);
			}else{
				firstScriptNode.parentNode.insertBefore(scriptEl, firstScriptNode);
				window['__putPixel'](300500, params['sectionId'] ? params['sectionId'] : false);
			}

			return true;
		}

		/**
		 * @event
		 * Triggers on DMP answer process complete. Lauches ad server request routine.
		 */
		this.onDmpProcessed = function(){
			var fnId, fn;
			for ( var fnId in me.dmpFinishCallbackFns ){
				fn = me.dmpFinishCallbackFns[fnId];
				if ( me.dmpFinishCallbackFns.hasOwnProperty(fnId) && typeof fn === 'function' ){
					fn.call();
				}
			}
			// we manage to get DMP response until timeout expire, let's clear timeout
			me.dmpExpireTimers = me.dmpExpireTimers || [];
			for (var i = 0, l = me.dmpExpireTimers.length; i < l; i++) {
				clearTimeout(me.dmpExpireTimers[i]);
			}
		};

        /**
         * Server response processing handler.
         * SERVER_RESPONSE_HANDLER_NAME is a global string variable. This variable
         * also is sent to ad server, ad servers responds with same name used
         * as callback function.
         * @param {Array} slots Array of server slot definitions.
         */
        this.serverResponseHandler = function(slots){
            var slot, slotId, size, slotDef, sectionIdToLog;
            sectionIdToLog = false;
            if (slots && slots.length > 0 && slots[0]['section_id']){
                sectionIdToLog = slots[0]['section_id'];
            }

            window['__putPixel'](300600, sectionIdToLog);

            if ( !slots || !slots.length ){
                return;
            }

            me.serverSlotsDef = me.serverSlotsDef || {};
            for (var i = 0, l = slots.length; i < l; i++) {
                slot = slots[i];

                slotId = SLOT_ID_PREFIX + slot['id'] + SLOT_SECTION_ID_DELIMITER + slot['section_id'];
                size = slot['size'];

                // parse and process received ad size
                if ( me.notEmptyVar(size) ) {
                    size = size.split(me.sizeDelimiter);
                }

                slotDef = {
                    slotId: slotId,
                    sectionId: slot['section_id'],
                    data: slot['data'],
                    type: slot['type'] || '',
                    size: size,
                    isRich: !!slot['is_rich'],
                    noad: slot['noad'],
                    dynamicHeight: slot['dynamic_height']
                    //dynamicWidth: slot['dynamic_width'], // temporary disabled
                };

                // add slot definition into storage variable
                me.serverSlotsDef[ slotDef.sectionId ] = me.serverSlotsDef[slotDef.sectionId] || {};
                me.serverSlotsDef[ slotDef.sectionId ][ slotDef.slotId ] = slotDef;

                // try to display
                me.displayAd(slotId, slotDef.sectionId, slotDef);
            }
        };

		/**
		 * Prepares url, which will be used to call ad server for ads.
		 * @param {String} baseUrl Without protocol, if possible
		 * @returns {String} final url
		 */
		this.generateAdServerUrl = function(params){
			// notice that params object is given from outside, consider this fact
			// and presence of closure complier minification, when working with it
			params = params || {};
			if (!params['sectionId']){ return; }
			var useSSL = 'https:' === document.location.protocol,
				url,
				knownParams,
				allParams = [],
				baseParams,
				userParams,
				segments,
				responseFormat,
				customHandler,
				handlerName,
				handlerScope,
				sectionId,
				handler,
				click3rd,
				lang = this.getLang(),
                urlParams;

			knownParams = ['section_id', 'handler_name', 'handler', 'handler_scope', 'tz', 'fl', 'click3rd', 'seg', 'is_secure', 'ord', 'pid', 'ad_preview_li_id', 'format'];
			urlParams = this.parsePageUrl() || {};
            if (!!urlParams['ad_preview_li_id']){
                url = AD_SERVER_PREVIEW_URL;
            }else{
                url = AD_SERVER_URL;
            }

			customHandler = params['handler'];
			handlerScope = params['handler_scope'];
			sectionId = params['sectionId'];

			if (customHandler) {
				if (typeof customHandler === 'function') {
					handler = customHandler;
				} else if (typeof window[customHandler] === 'function') {
					handler =  window[customHandler];
				}
			}

			if (!handler) {
				customHandler = false;
				handler = this.serverResponseHandler;
				handlerScope = this;
			} else if (typeof handlerScope !== 'object') {
				handlerScope = {
					serverResponseHandler: function(){ return me.serverResponseHandler.apply(me, arguments); }
				};
			}

			handlerName = SERVER_RESPONSE_HANDLER_NAME + '_' + sectionId;

			window[handlerName] = function () {
				try {
					delete window[handlerName];
				} catch(err) {
					window[handlerName] = undefined;
				}
				handler.apply(handlerScope, arguments);
			};

            // remove protocol and trailing "?"
			url = url.replace(/^http:|^https:|\?$/im, '');
			url = (useSSL ? 'https:' : 'http:') + url;
			// make base params
			baseParams = [
				'section_id=' + sectionId,
				'handler_name=' + handlerName,//SERVER_RESPONSE_HANDLER_NAME,
				'tz=' + new Date().getTimezoneOffset(),
				'fl=' + me.getFlashVersion(),
				'is_secure=' + ( useSSL ? 1 : 0 ),
				'pid=' + me.pid
			];
            if (!!urlParams['ad_preview_li_id']){
               baseParams.push('ad_preview_li_id=' + urlParams['ad_preview_li_id']);
            }

			responseFormat = params['format'];

			if (responseFormat && responseFormat !== 'jsonp') {
				if (!customHandler) {
					throw new Error('If "format" parameter  is specified as "jsonp_raw", a custom handler parameter "handler_name" must be also specified as function or as name of existent function in global call stack.');
				} else {
					baseParams.push('format=' + responseFormat);
				}
			}

			// this is useless from technical side, but good to keep logic straight
			// add base params into array of all params
			allParams = allParams.concat(baseParams);

			// Add user-defined params (which were used in section loading method on page) to final URL
			userParams = (this.sectionInfo[ params['sectionId'] ] || {})['custom'];
			allParams = me.addParams(userParams, allParams, knownParams);

			// If DMP is used and there's some data from DMP, add it to URL (params)
			if ( params['dmp'] && me.dmpParams ){
				allParams = me.addParams(me.dmpParams, allParams, knownParams);
			}

			click3rd = (this.sectionInfo[params['sectionId']] || {})['click3rd'];
			if ( click3rd){
				allParams.push( 'click3rd=' + click3rd );
			}

			if ( lang !== false ){
				allParams.push( 'lang=' + encodeURIComponent(lang) );
			}
            // form base url, which is the minimal for making the request: protocol + server url + cache buster
            url += '?ord=' + Math.floor( Math.random() * 10e12 );

            var segmentsPart = '';
			// Add defined segments to final URL
			segments = me.segments;
			if ( typeof segments !== 'undefined' && segments.length > 0 ){
                segmentsPart = me.limitSegments( url, allParams, 'seg=' + segments.join('_') );
				allParams.push(segmentsPart);
			}
            url += '&' + allParams.join('&');
			return url;
		};
        this.parsePageUrl = function(){
            var res, pair, href;
            res = {};
            href = document.location.href; // str
            href = href.split('?')[1]; // arr
            if (!href){
                return res;
            }
            try{
                href = href.split('&');
            }catch(err){
                return res;
            }
            for (var i = 0; i < href.length; i++){ // arr
                pair = href[i] || '';
                try{
                    pair = pair.split('=');
                }catch(err){
                    pair = [];
                }
                if (this.isDefined(pair[0])){
                    res[pair[0]] = pair[1];
                }
            }
            return res;
        };
        /**
         *
         * @param {String} baseUrl base part of url, cannot be cut
         * @param {String[]} params Array of generated additonal params. Looks like ['lang=en', 'click3rd=1',...]
         * @param {String} segments String 'seg=seg1_seg2_seg3...' which is a subject to cut
         * @returns {String} Returns processed segments
         */
        this.limitSegments = function(baseUrl, params, segments){
            if ( (baseUrl + '&' + params.join('&') + segments).length <= 2000 ){ return segments; }
            var tempUrl, tempSegments, i;
            tempUrl = baseUrl + '&' + params.join('&');
            tempSegments = segments.split('_');
            i = 0; // to not fall into endless loop
            while ((tempUrl + tempSegments.join('_')).length > 2000 && i < 10000) {
                tempSegments.pop();
                i++;
            }
            return tempSegments.join('_');
        },
		/**
		 * Adding params from hash (object {key:value,...}) into array ["key=value",...]
		 * @param {Object} from
		 * @param {Array} where
		 * @param {Array} knownParams
		 * @returns {Array} Modified (or not) 'where'
		 */
		this.addParams = function(from, where, knownParams){
			from = from || {};
			where = where || [];
			knownParams = knownParams || []; // TODO faster to make object
			var value;
			piterate: for ( var name in from ){
				// do not add 'known' params, they're static and mustn't be overriden
				for (var i = 0, l = knownParams.length; i < l; i++){
					if ( knownParams[i] + '' === name + '' ){
						continue piterate;
					}
				}
				if ( from.hasOwnProperty(name) ){
					value = from[name];
					if ( me.isArray(value) ){
						for (var j = 0; j < value.length; j++){
							where.push( name + '=' + encodeURIComponent( value[j] ) );
						}
						continue piterate;
					}
					where.push( name + '=' + encodeURIComponent(value) );
				}
			}
			return where;
		};
		/**
		 * Returns slot server definition, if found or false;
		 * @param {String} slotId
		 * @returns {Boolean|Object}
		 */
		this.getSlotDefById = function(slotId, sectionId){
			me.serverSlotsDef = me.serverSlotsDef || {};
			var slotIdArr;
			if (!me.isDefined(sectionId)){ // if no sectionId is given, try to cut it from id
				slotIdArr = slotId.split(SLOT_SECTION_ID_DELIMITER || '_');
				if (slotIdArr.length > 0){
					sectionId = slotIdArr[slotIdArr.length - 1];
				}
			}
			return me.serverSlotsDef[sectionId] && me.serverSlotsDef[sectionId][slotId];
		};
		this.setSlotIsDisplayed = function(state, slotData){
			if (!me.isDefined(state)){return;}
			me.displayedAds[slotData.sectionId] = me.displayedAds[slotData.sectionId] || {};
			if (!!state){
				me.displayedAds[ slotData.sectionId ][ slotData.slotId ] = true;
			}else{
				delete me.displayedAds[ slotData.sectionId ][ slotData.slotId ];
			}
			return this;
		};
		/**
		 * Checks if slot is displayed
		 * @param {Object} slotData
		 * @returns {Boolean}
		 */
		this.slotIsDisplayed = function(slotData){
			var res, section, slot;
			section = slotData.sectionId;
			slot = slotData.slotId;
			try{
				res = !!me.displayedAds[section][slot];
			}catch(e){
				res = false;
			}
			return res;
		};

		this.getLang = function(){
			var metaTags = document.getElementsByTagName('meta'),
				equiv,
				lang = false;

			for ( var i = 0; i < metaTags.length; i++){
				equiv = false;
				if (!!metaTags[i]){
					equiv = metaTags[i].getAttribute('http-equiv') || metaTags[i]['httpEquiv'];
				}

				if ( !!equiv && equiv.toLowerCase() === 'content-language'){
					lang = metaTags[i].getAttribute('content') || metaTags[i]['content'];
					lang = lang || false;
					return lang;
				}
			}
			return lang;
		};
	}

	/**
	 * Instance of this class is connected to AdManager and performs all
	 * operations related to ad rendering on page. Usually AdManager calls
	 * AdRenderer's instance's renderSlot method with slot id argument.
	 * @class AdRenderer
	 * @extends AdBase
	 * @param {AdManager} adManager
	 */
	function AdRenderer(adManager){
		var me = this;
        this.useNoad = true;
		/**
		 * Link between AdManager and AdRenderer
		 * @property {AdManager} adManager
		 */
		if ( adManager instanceof  AdManager){
			this.adManager = adManager;
		}

		/**
		* Renders ad content.
		* TODO: more detailed description
		* @param {Object} slot slot definition
		* @returns {Boolean} slot render success.
		*/
		this.renderSlot = function(slot){
            /* istanbul ignore else */
            if (!slot || !slot.slotId){
                log('Calling renderSlot without slot definition argument is not allowed');
                return false;
            }
            var parentEl,
                fif,
                fifWindow,
                fifDocument,
                content,
                contentType,
                syncTagText,
                isNetscape,
                prevDisplay,
                resizerFnName,
                addEvent,
                isUpdateSize,
                sizeUpdateScript,
                slotX,
                slotY;
            parentEl = document.getElementById(slot.slotId);
			// ad HTML container is not rendered yet
            /* istanbul ignore else */
			if ( !parentEl ){
				log('Not ready to render: ' + slot.slotId);
				return false;
			}
            // update or setup a link, to make it easier to call it from inside iframe
            resizerFnName = '__asl__adjustHeight';
            window[resizerFnName] = window[resizerFnName] || me.slotSizeUpdate;
            contentType = slot.type;

            slotX = parseInt(slot.size[0], 10);
            slotY = parseInt(slot.size[1], 10);
            // attach "update size routine" if:
            // slot has dynamicHeight or dynamicWidth(disabled for now) feature
            // OR
            // slot has "0x0" size given by adserver
            isUpdateSize = (slotX !== 0 || slotY !== 0) && (slot.dynamicHeight || slot.dynamicWidth);
			// only for js content ad in sync mode.
			if ( contentType === 'javascript' && me.isSyncMode(slot.sectionId) ){
				syncTagText = '\x3Cscript type="text/javascript">' + slot.data + '\x3C\/script>';
				document.write(syncTagText);

                if (me.useNoad && slot.noad){
                    parentEl.setAttribute('data-default-display', parentEl.style.display);
                    parentEl.style.display = 'none';
                }
                try{
                    isUpdateSize && window[resizerFnName](null, slot.slotId, true);
                }catch(err){
                    log('Resize fail' + err);
                }
				log('Filled content on: ' + slot.slotId + ' ' + 'with ' + slot.type + ' content');
				return true;
			}

			fif = me.prepareFrame(slot);
			fif.src = 'javascript:\"<html><body style=\'background:transparent;margin:0%;\'></body></html>\"';
			parentEl.innerHTML = '';
			parentEl.appendChild(fif);

			if (me.getIEVersion() !== 0 && !slot.isEncoded){
				slot.data = me.hexEncode(slot.data);
				slot.isEncoded = true;
			}

			// function is declared to be then inserted into the 'content' string
			// done to make it be less ugly
			addEvent = this.addEvent;
			if (typeof QUnit !== 'undefined') {
				//cut out QUnit content from addEvent function for run it in iframe
				addEvent = 'function(elem, event, fn, useCapture){\
					if (elem.addEventListener) {\
						elem.addEventListener(event, fn, useCapture);\
					} else {\
						elem.attachEvent("on" + event, function() {\
							return(fn.call(elem, window.event));\
						});\
					}\
				}';
			}

			sizeUpdateScript = ''+
                '\x3Cscript type=\"text/javascript\">'+
                        'var addEvent = ' + addEvent + ';'+
                        'addEvent(window, "load", invokeResize, true);'+
                        'function invokeResize(){'+
                            'try{window.parent["' + resizerFnName + '"]('+
                                '"' + fif.id + '","' +
                                slot.slotId + '");}catch(err){}' +
                        '}'+
                    '\x3C\/script>';
			switch (contentType){
				case 'javascript':
					content = '<html><body style=\'background:transparent;margin:0%;\'>' +
						'\x3Cscript type=\"text/javascript\">var inDapIF=true;\x3C\/script>' +
						'\x3Cscript type=\"text/javascript\">' +
							slot.data +
						'\x3C\/script>' +
						(isUpdateSize ? sizeUpdateScript : '') +
						'<\/body><\/html>';

					break;
				case 'html':
					content = slot.data;
					break;
			}

			// browser-specific flow
			isNetscape = me.isNetscape();
			fifDocument = fif.contentWindow ? fif.contentWindow.document : fif.contentDocument;


			if ( me.getIEVersion() !== 0 || isNetscape ){
                fifWindow = window.frames[ fif.name ];
				fifWindow['contents'] = content;
				fifWindow.location.replace( me.getFifLocationIE(slot) );
			}else{
				if (navigator.userAgent.indexOf('Firefox') !== -1){
					fifDocument.open('text/html', 'replace');
				}
				fifDocument.write(content);
				fifDocument.close();
			}
            /* istanbul ignore else */
            if (me.useNoad){
                if (slot.noad){
                    /* istanbul ignore else */
                    if (parentEl.getAttribute('data-noad') !== '1'){
                        parentEl.setAttribute('data-default-display', parentEl.style.display);
                        parentEl.setAttribute('data-noad', '1');
                        parentEl.style.display = 'none';
                    }
                }else{
                    prevDisplay = parentEl.getAttribute('data-default-display') || '';
                    parentEl['removeAttribute']('data-default-display');
                    parentEl['removeAttribute']('data-noad');
                    parentEl.style.display = prevDisplay;
                }
            }

			log('Filled content on: ' + slot.slotId + ' ' + 'with ' + slot.type + ' content');

			if (contentType === 'html' && isUpdateSize){
                var fifName = fif.name,
                    fifId = fif.id;
                if (me.getIEVersion() !== 0 || isNetscape){
                    // timeout is needed to give IE a time to create elements
                    setTimeout(
                        function(){
                            me.addIframeLoadEvent(fifName, fifId, slot.slotId, resizerFnName);
                        },
                        isNetscape ? 1000 : 100 // netscape is weird and irrelevant
                    );
                }else{
                    this.addIframeLoadEvent(fifName, fifId, slot.slotId, resizerFnName);
                }
			}
			return true;

		};
        this.addEvent = function (elem, event, fn, useCapture) {
            if (elem.addEventListener) {
                elem.addEventListener(event, fn, useCapture);
            } else {
                elem.attachEvent("on" + event, function() {
                    return(fn.call(elem, window.event));
                });
            }
        };
        this.addIframeLoadEvent = function(fifName, fifId, slotId, resizerFnName){
            var fifWindow = window.frames[ fifName ];
            var myWindow = window;
            var frameEl = document.getElementById(fifId);
            var loaded = false;
            var onLoadFunc = function(){
                if (loaded) return;
                loaded = true;
                try{
                    myWindow[resizerFnName](fifId, slotId);
                }catch(err){
                    if (window['__ASL_DEBUG']){
                        console.error(err);
                    }
                }
            };
            this.addEvent(fifWindow, 'load', onLoadFunc, true);
            frameEl && this.addEvent(frameEl, 'load', onLoadFunc, true);

            try {
                if (fifWindow && fifWindow.document && fifWindow.document.readyState === 'complete') {
                    onLoadFunc();
                }
            } catch(err){
                if (window['__ASL_DEBUG']){
                    console.error(err);
                }
            }
        };
		/**
		 * Creates basic firendly iframe (fif).
		 * @param {Object} slot slot server definition
		 * @returns {HTMLElement}
		 */
		this.prepareFrame = function(slot){
			var fif = document.createElement('iframe'),
				fifStyle = 'border:none;',
				fifName = me.getFrameName(slot.slotId);

			// width of iframe
			if ( me.notEmptyVar( slot.size[0] ) ){
				fifStyle += 'width:' + slot.size[0] + 'px;';
				fif.width = slot.size[0];
			}

			// height of iframe
			if ( me.notEmptyVar( slot.size[1] ) ){
				fifStyle += 'height:' + slot.size[1] + 'px;';
				fif.height = slot.size[1];
			}

			//hide iframe if size is 0x0
			if (slot.size[0] === '0' && slot.size[1] === '0') {
				fifStyle += 'display:none;';
			}

			fif.setAttribute('style', fifStyle);
			fif.setAttribute('frameBorder', '0');
			fif.setAttribute('scrolling', 'no');
			fif.name = fifName;
			fif.id = fifName;

			return fif;
		};

		/**
		 * Returns correct location for iframe in case of old browser
		 * @returns {String}
		 */
		this.getFifLocationIE = function(slot){
			return me.isNetscape() && !me.isSyncMode(slot.sectionId) ?
				'javascript:document.write(window.contents);' :
				'javascript:window.contents';
		};

		this.getFrameName = function(slotId){
			return 'fif_slot_' + SLOT_ID_PREFIX + '_' + slotId;
		};

		/**
		 *
		 * @param {String} frameId id attr of IFRAME element. This is id is generated in
		 * prepareFrame method, while iframe generation
         * @param {String} slotId id attr of DIV element
         * @param {Boolean} [sync] True for sync slot (no frame)
		 * @returns {undefined}
		 */
		this.slotSizeUpdate = function(frameId, slotId, sync){
			var slotDef, frameEl, divEl, frameOuterSize, frameInnerSize;
			slotDef = me.adManager.getSlotDefById(slotId);

            frameEl = document.getElementById(frameId);
            divEl = document.getElementById(slotId);
			//Remove support for fullWidth and fullWidthCentered
            /*if (sync && slotDef.fullWidth){
                divEl.style['width'] = '100%';
                divEl.style['height'] = 'auto';
                return;
            }*/
			if (!frameEl || !divEl){ return; }

            frameInnerSize = me.getFrameContentSize(frameEl);
            frameOuterSize = me.getFrameOuterSize(frameEl);

			// regular mode

			// #1: if slot def has "dynamicHeight" feature OR server given sizeY = 0
			// try to adjust slot's height
			if (!!slotDef.dynamicHeight || parseInt(slotDef.size[1], 10) === 0){
				// adjust height; no shrink, only if content is bigger than container (IFRAME)
				if ( !isNaN(frameOuterSize.y) && frameInnerSize.y > frameOuterSize.y ){
					// frame height = content height
					frameEl.style['height'] = frameInnerSize.y + 'px';
					frameEl.setAttribute('height', frameInnerSize.y);

					// if DIV had height set, change it, otherwise it will (should) fit IFRAME's height
					// TODO: test
					if ( me.isDefined(divEl.style['height']) ){
						divEl.style['height']= frameInnerSize.y + 'px';
					}
				}
			}

			// #2: if slot has dynamicWidth feaure (disabled for now) OR server given size X = 0
			// try to adjust slot's width
			if (!!slotDef.dynamicWidth || parseInt(slotDef.size[0], 10) === 0){
				// adjust width (no shrink)
				if ( !isNaN(frameOuterSize.x) && frameInnerSize.x > frameOuterSize.x ){
					frameEl.style['width'] = frameInnerSize.x + 'px';
					frameEl.setAttribute('width', frameInnerSize.x);

					// there's is not 'auto' width for block elements, so give it a height without conditions
					divEl.style['width'] = frameInnerSize.x + 'px';
				}
			}
			frameEl.style['display'] = 'block';

		};

        this.getFrameContentSize = function(frameEl){
            var frameInnerHeight, frameInnerWidth, body, html, frameDoc;
            frameDoc = frameEl.contentWindow ? frameEl.contentWindow.document : frameEl.contentDocument;
			body = frameDoc.body;
			// IE 5.5 may calculate iframe's parent's height (window height)
			html = me.getIEVersion() < 6 ? body : frameDoc.documentElement;
            // http://stackoverflow.com/questions/1145850/how-to-get-height-of-entire-document-with-javascript
            frameInnerHeight = Math.max(
                body.scrollHeight,
                body.offsetHeight,
                html.clientHeight,
                html.scrollHeight,
                html.offsetHeight
            );

            frameInnerWidth = Math.max(
                body.scrollWidth,
                body.offsetWidth,
                html.clientWidth,
                html.scrollWidth,
                html.offsetWidth
            );

            return {
                x: frameInnerWidth,
                y: frameInnerHeight
            };
        };

        this.getFrameOuterSize = function(frameEl){
            var frameOuterHeight, frameOuterWidth, frameComputedStyles;

			// from jquery's getStyles method
			// Support: IE<=11+, Firefox<=30+ (#15098, #14150)
			// IE throws on elements created in popups
			// FF meanwhile throws on frame elements through "defaultView.getComputedStyle"
			if ( window.getComputedStyle ){
				if ( frameEl.ownerDocument.defaultView.opener ) {
					frameComputedStyles = frameEl.ownerDocument.defaultView.getComputedStyle( frameEl, null );
				}else{
					frameComputedStyles = window.getComputedStyle( frameEl, null );
				}
			}else{
				frameComputedStyles = frameEl.currentStyle || {};
			}
			frameOuterHeight = frameComputedStyles ? frameComputedStyles['height'] : frameEl.style.height;
			frameOuterHeight = parseInt(frameOuterHeight, 10);

            frameOuterWidth = frameComputedStyles ? frameComputedStyles['width'] : frameEl.style.width;
			frameOuterWidth = parseInt(frameOuterWidth, 10);

            return {
                x: frameOuterWidth,
                y: frameOuterHeight
            };
        };
	}

	/**
	 * Base class for AdRenderer and AdManager, holds some common functions.
	 * @class AdBase
	 */
	function AdBase(){
		var me = this;
		/**
		 * Hash (object) property to keep sectionId info (sync, dmp, other stuff);
		 * is needed because jsonp callback has no connection with its 'sending' code.
		 * The only way to link rendering slot and section settings is section id (as
		 * ad server response contains it)
		 * @property {Object}
		 */
		this.sectionInfo = {};
		/**
		 * String to split size string given by server.
		 * @property {String} sizeDelimiter.
		 */
		this.sizeDelimiter = 'x';
		if (!Function.prototype.bind) {
			Function.prototype.bind = function(oThis) {
              /* istanbul ignore if */
			  if (typeof this !== 'function') {
				// closest thing possible to the ECMAScript 5
				// internal IsCallable function
				throw new TypeError('Function.prototype.bind - what is trying to be bound is not callable');
			  }

			  var aArgs   = Array.prototype.slice.call(arguments, 1),
				  fToBind = this,
				  fNOP    = function() {},
				  fBound  = function() {
					return fToBind.apply(this instanceof fNOP
						   ? this
						   : oThis,
						   aArgs.concat(Array.prototype.slice.call(arguments)));
				  };

			  fNOP.prototype = this.prototype;
			  fBound.prototype = new fNOP();

			  return fBound;
			};
		}
		/**
		 * Returns flash version or 0 if none;
		 * @returns {Number}
		 */
		this.getFlashVersion = function(){
			var flashVersion = 0,
				d;

			if ( me.isDefined(navigator.plugins) && typeof navigator.plugins['Shockwave Flash'] === 'object' ) {
				d = navigator.plugins['Shockwave Flash'].description;
				if (d &&
					!(me.isDefined(navigator.mimeTypes) &&
						navigator.mimeTypes['application/x-shockwave-flash'] &&
						!navigator.mimeTypes['application/x-shockwave-flash'].enabledPlugin)
					) {
					d = d.replace(/^.*\s+(\S+\s+\S+$)/, '$1');
					flashVersion = parseInt(d.replace(/^(.*)\..*$/, '$1'), 10);
				}
			} else if ( me.isDefined(window.ActiveXObject) ) {
				try {
					var a = new ActiveXObject('ShockwaveFlash.ShockwaveFlash');
					if (a) {
						d = a.GetVariable('$version');
						if (d) {
							d = d.split(' ')[1].split(',');
							flashVersion = parseInt(d[0], 10);
						}
					}
				} catch(e) {}
			}

			return flashVersion;
		};

		/**
		 * Returns browser viewport size in (virtual) pixels.
		 * @returns {Object} {width: {Number}, height: {Number}}
		 */
		this.getScreenSize = function(){
			// Trying to calculate browser window height
			var winHeight = 0,
				winWidth = 0;
            /* istanbul ignore else */
			if( typeof window.innerHeight === 'number' ) {
				// Non-IE
				winHeight = window.innerHeight;
				winWidth = window.innerWidth;
			} else if( document.documentElement && ( document.documentElement.clientWidth || document.documentElement.clientHeight ) ) {
				// IE 6+ in 'standards compliant mode'
				winHeight = document.documentElement.clientHeight;
				winWidth = document.documentElement.clientWidth;
			} else if( document.body && ( document.body.clientWidth || document.body.clientHeight ) ) {
				// IE 4 compatible
				winHeight = document.body.clientHeight;
				winWidth = document.body.clientWidth;
			}

			return {
				width: winWidth,
				height: winHeight
			};
		};

		/**
		 * Basic check for typeof !== undefined
		 * @param {void} [subject]
		 * @returns {Boolean}
		 */
		this.isDefined = function(subject){
			return typeof subject !== 'undefined';
		};

		/**
		 * Checks variable for containing any value.
		 * TODO: may impl. object/arrays correct processing. Minor.
		 * @param {void} variable
		 * @returns {Boolean}
		 */
		this.notEmptyVar = function(variable){
			return me.isDefined(variable) &&
				( variable !== null ) &&
				( variable + '' !== '' );
		};

		/**
		 * Returns current sync/async state
		 * @returns {Boolean}
		 */
		this.isSyncMode = function(sectionId){
			// 'sync' is from outside, do not let CC to rename it
			return me.sectionInfo && me.sectionInfo[sectionId] && me.sectionInfo[sectionId]['sync'];
		};

		/**
		 * Returns Internet Explorer version or 0 if not IE.
		 * @returns {Number}
		 */
		this.getIEVersion = function() {
			var agent = navigator.userAgent,
				isIE = agent.indexOf('MSIE ');
			return -1 === isIE ? 0 : parseFloat( agent.substring( isIE + 5, agent.indexOf(';', isIE) ) );
		};

		/**
		 * Returns true if current browser is suspected to be NN
		 * @returns {Boolean}
		 */
		this.isNetscape = function() {
			var agent = navigator.userAgent;
			return agent.match(/\d\sNavigator\/\d/) !== null || agent.match(/\d\sNetscape\/\d/) !== null;
		};

		/**
		 * Checks if useragent is old Opera. Old Opera is the Opera browser before webkit engine
		 * @returns {Boolean}
		 */
		this.isPresto = function() {
			return navigator.userAgent.indexOf('Opera') !== -1;
		};

		/**
		 * Polyfill from MDN. Checks arg.
		 * @param {Mixed} arg
		 * @returns {Boolean}
		 */
		this.isArray = function(arg) {
			return Object.prototype.toString.call(arg) === '[object Array]';
		};
		/**
		 * Encodes string into hex NCRs (for IE inserting)
		 * @param {String} inputString
		 * @returns {String}
		 */
		this.hexEncode = function(inputString){
			window.hexDic = window.hexDic || {};
			inputString += '';
			var result = [], dic = window.hexDic;
			for (var i = 0; i < inputString.length; i++) {
				var currentChar = inputString.charAt(i),
					currentCode = currentChar.charCodeAt(0),
					nextCharIndex = i + 1;
				if (8 > currentCode || 127 < currentCode){
					if (currentChar in dic){
						currentChar = dic[currentChar];
					}else {
						currentCode = '&#x' + ('000' + currentCode.toString(16) ).slice(-4) + ';';
						currentChar = dic[currentChar] = currentCode;
					}
				}
				result[nextCharIndex] = currentChar;
			}
			return result.join('');
		};

        /**
        * Should generate some string ID.
        * @returns {String}
        */
        this.genPageId = function(){
           var h = this.hash;
           return h() + h() + h() + h() + h() + h() + h();
        };
        /**
        * Returns "kinda UUID" random string in form XXXXXXXX-XXXX-XXXX-XXXX-XXXX-XXXXXXXX
        * @return {String}
        */
        this.uuid = function() {
           var h = this.hash;
           return h() + h() +'-'+ h() +'-'+ h() +'-'+ h() +'-'+ h() + '-' + h()+h();
        };
        /**
        * Returns a random hex string of four bytes
        * @return {String}
        */
        this.hash = function() {
           return Math.floor((1 + Math.random()) * 65536).toString(16).substring(1);
        };
		/**
		 * Generates (Math.) random integer and returns it.
		 * If used with one argument, it will be considered as <b>max</b> (0, max)
		 * @param {Number} [min] May be omitted, 0 will be used
		 * @param {Number} [max] May be omitted, 0 will be used
		 * @returns {*}
		 */
		this.genRandomInt = function(min, max) {
			return Math.floor(Math.random() * (max - min + 1)) + min;
		};
		/**
		 * Generates random (Math.random) string with given length
		 * @param {Number} len Desired length
		 * @returns {String}
		 */
		this.genRandomString = function(len){
			var charSet, result;
			charSet = '1qwe8rty2uiop3a0sdf4ghjkl5z9xcv6bnm7MNBVCXZASDFGHJKLPOIUYTREWQ'.split('');
			result = '';
			len = len || 0;
			if ( len <= 0 ){ return ''; }
			while(len > 0){
				result += charSet[this.genRandomInt(0, charSet.length - 1)];
				len--;
			}
			return result;
		};
	}

	// custom logging function
	function log(text){
		if ( window['__ASL_DEBUG'] && (typeof console !== 'undefined') && (console.info) ){
			console.info( new Date(), ' -> ', text.replace('http', 'htt_p'));
		}
	}

// below is DMP source code

	function initDmpHandler(){
		// DMP response handling
		window[__DMP_PROCESSING_CALLBACK_FN_NAME] = function(segs, pigs){
			var params, showadProvider;
			window['__DMP_RESULT'] = window['__DMP_RESULT'] || {};
			params = window['__DMP_RESULT'];
			params.segs = segs;
			params.pigs = pigs;
			showadProvider = window[aslGlobalName]; // connect to showad lib even if in same file
			// call DMP processing
			if (showadProvider && typeof showadProvider['processDmp'] === 'function' ){
				showadProvider['processDmp'].call(window, segs, pigs);
			}
			addPiggybacks(pigs);
			setSegmentCookies(segs);
		};
	}
	function addPiggybacks(pbs){
		if (!pbs || !isArray(pbs) || pbs.length <= 0) {
			return;
		}
		// custom frame to deliver piggybacks
		var ifr_id = "cftdpb_" + Math.floor(Math.random() * 10e12);
		var ifr = document.createElement("iframe");
		ifr["id"] = ifr_id;
		ifr["style"]["display"] = "none";
		ifr.onload = function() {
			var pbUrl, ifrDoc;
			ifrDoc = ifr.contentWindow.document;
			for (var i = 0; i < pbs.length; i++) {
				pbUrl = location.protocol === "https:" ? pbs[i]["url_secure"] :  pbs[i]["url"];
				if (pbs[i]["type"] === "script") {
					var scrt = document.createElement("script");
					scrt["type"] = "text/javascript";
					scrt["src"] = pbUrl;
					ifrDoc.body.appendChild(scrt);
				} else if (pbs[i]["type"] === "image") {
					(new Image())["src"] = pbUrl;
				}
			}
		};
		var b = document.getElementsByTagName("script")[0];
		b.parentNode.insertBefore(ifr, b);
	}

	function setSegmentCookies(passedSegment){
		if (!!window['__ASL_DMP_NO_COOKIE'] || !passedSegment || !isArray(passedSegment)) {
			return;
		}

		var cookieName = __DMP_SEG_COOKIE_NAME,
			segmentPrefix;

		if (!cookieName || cookieName + '' === ''){
			return;
		}
		cookieName += '';
		segmentPrefix = __DMP_SEG_COOKIE_PREFIX;
		var expireDate = new Date();
		expireDate.setTime(expireDate.getTime() + 86400000 * 365);
		var expireDateString = expireDate.toGMTString();
		var segmentList = '';
		if (passedSegment.length > 0) {
		  for (var i = 0; i < 21 && i < passedSegment.length; i++) {
			passedSegment[i] = ('0000' + String(passedSegment[i])).slice(-5);
			segmentList += segmentPrefix + i + '=' + passedSegment[i] + '/';
		  }
		  segmentList = segmentList.replace(/\,$/, '');
		} else {
		  segmentList = segmentPrefix + '0=0';
		}
		document.cookie = cookieName + '=' + escape(segmentList) + '; expires=' + expireDateString + '; path=/';
	}

	function isArray(arg) {
		return Object.prototype.toString.call(arg) === '[object Array]';
	}

	function makeDmpCall(sync){
		// if no valid callback function is found => response will break page, exit
		if ( typeof window[__DMP_PROCESSING_CALLBACK_FN_NAME] !== 'function' ){
			return;
		}

		window['<DMP_ITM_A1_CALL_VAR_NAME>'] = false; // RT:329061 A1 dmp flag for 3rd party

		adManager.dmpIsLoading = true;
		// calculate protocol and base DMP URL
		var protocol = "https:" === document.location.protocol ? "https:" : "http:",
			dmpUrl;
			//mtk, // RT355100
			//i = 0; // RT355100
        dmpUrl = protocol + DMP_URL;
        // dmp url may contain GET params already
        dmpUrl += (dmpUrl.indexOf('?') === -1 ? '?' : '&') +
            'jsonp=' + __DMP_PROCESSING_CALLBACK_FN_NAME +
            '&rft=jp' +
			'&tgsrc=f1h' +
            '&oid=' + __DMP_OID;
		// add src
		// RT355100: do not add
		//dmpUrl += '&src=' + encodeURIComponent(location.href);
		// add referrer
		// RT355100: do not add
		/*
		if (document.referrer){
			dmpUrl += '&ref=' + encodeURIComponent(document.referrer);
		}
		*/
		// collect MTK data
		// RT355100: do not collect
		/*
		mtk = collectMtk();
		for (; i < mtk.length; i++) {
			dmpUrl += '&mtk=' + encodeURIComponent( mtk[i] );
		}
		*/
		// cap URL length, throwing away its element starting from the end
		// RT355100: no chance for that
		/*
		while (dmpUrl.length > 2000) {
			var wk = dmpUrl.split('&');
			wk.pop();
			dmpUrl = wk.join('&');
		}
		*/
		if(!!sync){
			document.write('\x3Cscript type="text/javascript" src="' + dmpUrl + '">\x3C\/script>');
		}else{
			asyncAppend(dmpUrl);
		}
		window['__putPixel'](300400);
	}
	// RT355100: deprecated
	/*
	function collectMtk(){
		var i=0,
			metas = document.getElementsByTagName('meta'),
			ga = 'getAttribute',
			meta,
			metaName,
			metaContent;
		for(; i < metas.length; i++){
			meta = metas[i];
			metaName = meta && meta[ga]('name');
			metaContent = meta && meta[ga]('content');
			if (metaName && (metaName+'').toLowerCase() === 'keywords' && metaContent){
				for(var j = 0, wrds = (metaContent||'').split(','); j < wrds.length; j++){
					wrds[j]=wrds[j].replace(/(^[\s]+)|([\s]+$)/g,'');
				}
				return wrds;
			}
		}
		return [];
	}
	*/
	// copypaste from head. Script DOM node async insertion
	function asyncAppend(url){
		var scriptEl=document.createElement("script"),node = document.getElementsByTagName("script")[0];scriptEl.type = "text/javascript";scriptEl.src = url;scriptEl.async = true;
		if (navigator.userAgent.indexOf('Opera') !== -1) setTimeout(function(){node.parentNode.insertBefore(scriptEl, node);}, 0);
		else node.parentNode.insertBefore(scriptEl, node);
	}
    if (typeof QUnit !== 'undefined'){
        // export
        window.AdBaseConstructor = AdBase;
        window.AdManagerConstructor = AdManager;
        window.AdRendererConstructor = AdRenderer;
    }
})(window);
