/**
 * Sticky Sidebar JavaScript Plugin.
 * @version 1.0.0
 * @author Ahmed Bouhuolia <a.bouhuolia@gmail.com>
 * @license The MIT License (MIT)
 */
const StickySidebar = (() => {

  // ---------------------------------
  // # Define Constants
  // ---------------------------------
  //
  const EVENT_KEY = '.stickySidebar';
  const VERSION   = '2.0';

  const DEFAULTS = {
    
    /**
     * Additional top spacing of the element when it becomes sticky.
     * @type {Numeric|Function}
     */
    topSpacing: 0,

    /**
     * Additional bottom spacing of the element when it becomes sticky.
     * @type {Numeric|Function}
     */
    bottomSpacing: 0,

    /**
     * Container sidebar selector to know what the beginning and end of sticky element.
     * @type {String|False}
     */
    containerSelector: false,

    /**
     * Inner wrapper selector.
     * @type {String}
     */
    innerWrapperSelector: '.inner-wrapper-sticky',

    /**
     * The name of CSS class to apply to elements when they have become stuck.
     * @type {String|False}
     */
    stickyClass: 'is-affixed',

    /**
     * Detect when sidebar and its container change height so re-calculate their dimensions.
     * @type {Boolean}
     */
    resizeSensor: true,

    /**
     * The sidebar returns to its normal position if its width below this value.
     * @type {Numeric}
     */
    minWidth: false
  };

  // ---------------------------------
  // # Class Definition
  // ---------------------------------
  //
  /**
   * Sticky Sidebar Class.
   * @public
   */
  class StickySidebar{

    /**
     * Sticky Sidebar Constructor.
     * @constructor
     * @param {HTMLElement|String} sidebar - The sidebar element or sidebar selector.
     * @param {Object} options - The options of sticky sidebar.
     */
    constructor(sidebar, options = {}){
      this.options = StickySidebar.extend(DEFAULTS, options);

      // Sidebar element query if there's no one, throw error.
      this.sidebar = ('string' === typeof sidebar ) ? document.querySelector(sidebar) : sidebar;
      if( 'undefined' === typeof this.sidebar )
        throw new Error("There is no specific sidebar element.");

      this.sidebarInner = false;
      this.container = this.sidebar.parentElement;

      // Container wrapper of the sidebar.
      if( this.options.containerSelector ){
        var containers = document.querySelectorAll(this.options.containerSelector);
        containers.forEach((container, item) => {
          if( ! container.contains(this.sidebar) ) return;
          this.container = container;
        });

        if( ! containers.length )
          throw new Error("The container does not contains on the sidebar.");
      }

      // Current Affix Type of sidebar element.
      this.affixedType = 'static';
      this.direction = 'bottom';
      this.support = {
        transform:   false,
        transform3d: false
      };

      this._initialized = false;
      this._breakpoint = false;
      this._resizeListeners = [];
      
      // Dimenstions of sidebar, container and screen viewport.
      this.dimensions = {
        translateY: 0,
        topSpacing: 0,
        bottomSpacing: 0,
        sidebarHeight: 0,
        sidebarWidth: 0,
        containerTop: 0,
        containerHeight: 0,
        viewportHeight: 0,
        viewportTop: 0, 
        lastViewportTop: 0,
      };

      // Initialize sticky sidebar for first time.
      this.initialize();

      // Bind all event handlers for referencability.
      ['_onScroll', '_onResize', 'updateSticky'].forEach((method) => {
        this[method] = this[method].bind(this);
      });
    }

    /**
     * Initializes the sticky sidebar by adding inner wrapper, define its container, 
     * min-width breakpoint, calculating dimenstions, adding helper classes and inline style.
     * @private
     */
    initialize(){
      this._setSupportFeatures();

      // Get sticky sidebar inner wrapper, if not found, will create one.
      if( this.options.innerWrapperSelector ){
        this.sidebarInner = this.sidebar.querySelector(this.options.innerWrapperSelector);

        if( null !== this.sidebarInner )
          this.$sidebarInner = false;
      }
      
      if( ! this.sidebarInner ){
        let wrapper = document.createElement('div');
        wrapper.setAttribute('class', 'inner-wrapper-sticky');
        this.sidebar.appendChild(wrapper);

        while( this.sidebar.firstChild != wrapper )
          wrapper.appendChild(this.sidebar.firstChild);

        this.sidebarInner = this.sidebar.querySelector('.inner-wrapper-sticky');
      }

      // If there's no specific container, user parent of sidebar as container.
      if( null !== this.container )
        this.container = this.sidebar.parentElement;
      
      // If top/bottom spacing is not function parse value to integer.
      if( 'function' !== typeof this.options.topSpacing )
        this.options.topSpacing = parseInt(this.options.topSpacing) || 0;

      if( 'function' !== typeof this.options.bottomSpacing )
        this.options.bottomSpacing = parseInt(this.options.bottomSpacing) || 0;
          
      // Breakdown sticky sidebar if screen width below `options.minWidth`.
      this._widthBreakpoint();

      // Calculate dimensions of sidebar, container and viewport.
      this.calcDimensions();

      // Affix sidebar in proper position.
      this.stickyPosition();

      // Bind all events.
      this.bindEvents();
      
      // Inform other properties the sticky sidebar is initialized.
      this._initialized = true;
    }

    /**
     * Bind all events of sticky sidebar plugin.
     * @protected
     */
    bindEvents(){
      window.addEventListener('resize', this._onResize, {passive: true});
      window.addEventListener('scroll', this._onScroll, {passive: true});

      this.sidebar.addEventListener('update' + EVENT_KEY, this.updateSticky);

      if( this.options.resizeSensor ){
        this.addResizerListener(this.sidebarInner, this.updateSticky);
        this.addResizerListener(this.container, this.updateSticky);
      }
    }

    /**
     * Handles scroll top/bottom when detected.
     * @protected
     * @param {Object} event - Event object passed from listener.
     */
    _onScroll(event){
      this._calcDimensionsWithScroll();
      this.stickyPosition();
    }

    /**
     * Holds resize event when detected. When the browser is resizes re-calculate
     * all dimensions of sidebar and container.
     * @protected
     * @param {Object} event - Event object passed from listener.
     */
    _onResize(event){
      this._widthBreakpoint();
      this.updateSticky();
    }

    /**
     * Calculates dimesntions of sidebar, container and screen viewpoint
     * @public
     */
    calcDimensions(){
      if( this._breakpoint ) return;
      var dims = this.dimensions;

      // Container of sticky sidebar dimensions.
      dims.containerTop = this.container.offsetTop;
      dims.containerHeight = this.container.clientHeight;
      dims.containerBottom = dims.containerTop + dims.containerHeight;

      // Sidebar dimensions.
      dims.sidebarHeight = this.sidebarInner.offsetWidth;
      dims.sidebarWidth = this.sidebar.offsetWidth;
      
      // Screen viewport dimensions.
      dims.viewportHeight = window.innerHeight;

      this._calcDimensionsWithScroll();
    }

    /**
     * Some dimensions values need to be up-to-date when scrolling the page.
     * @private
     */
    _calcDimensionsWithScroll(){
      var dims = this.dimensions;

      dims.sidebarLeft = this.sidebar.offsetLeft;

      dims.viewportTop = document.documentElement.scrollTop || document.body.scrollTop;
      dims.viewportBottom = dims.viewportTop + dims.viewportHeight;
      dims.viewportLeft = document.documentElement.scrollLeft || document.body.scrollLeft;

      dims.topSpacing = this.options.topSpacing;
      dims.bottomSpacing = this.options.bottomSpacing;

      if( 'function' === typeof dims.topSpacing )
          dims.topSpacing = parseInt(dims.topSpacing(this.sidebar)) || 0;

      if( 'function' === typeof dims.bottomSpacing )
          dims.bottomSpacing = parseInt(dims.bottomSpacing(this.sidebar)) || 0;
    }
    
    /**
     * Detarmine wheather the sidebar is bigger than viewport.
     * @public
     * @return {Boolean}
     */
    isSidebarFitsViewport(){
      return this.dimensions.sidebarHeight < this.dimensions.viewportHeight;
    }

    /**
     * Detarmine wheather the page is scrolling to top.
     * @public
     * @return {Boolean} 
     */
    isScrollingTop(){
      return this.dimensions.viewportTop < this.dimensions.lastViewportTop;
    }

    /**
     * Gets affix type of sidebar according to current scrollTop and scrollLeft.
     * Holds all logical affix of the sidebar when scrolling up and down and when sidebar 
     * is bigger than viewport and vice versa.
     * @public
     * @return {String|False} - Proper affix type.
     */
    getAffixType(){
      var dims = this.dimensions, affixType = false;

      this._calcDimensionsWithScroll();

      var sidebarBottom = dims.sidebarHeight + dims.containerTop;
      var colliderTop = dims.viewportTop + dims.topSpacing;
      var colliderBottom = dims.viewportBottom - dims.bottomSpacing;

      // When browser is scrolling top.
      if( this.isScrollingTop() ){
        if( colliderTop <= dims.containerTop ){
          dims.translateY = 0;
          affixType = 'STATIC';

        } else if( colliderTop <= dims.translateY + dims.containerTop ){
          dims.translateY = colliderTop - dims.containerTop;
          affixType = 'VIEWPORT-TOP';

        } else if( ! this.isSidebarFitsViewport() && dims.containerTop <= colliderTop ){
          affixType = 'VIEWPORT-BOTTOM';
        }
      // When browser is scrolling up.
      } else {
        // When sidebar element is not bigger than screen viewport.
        if( this.isSidebarFitsViewport() ){

          if( dims.sidebarHeight + colliderTop >= dims.containerBottom ){
            dims.translateY = dims.containerBottom - sidebarBottom;
            affixType = 'CONTAINER-BOTTOM'; 

          } else if( colliderTop >= dims.containerTop ){
            dims.translateY = colliderTop - dims.containerTop;
            affixType = 'VIEWPORT-TOP';
          }
        // When sidebar element is bigger than screen viewport.
        } else {
    
          if( dims.containerBottom <= colliderBottom ){
            dims.translateY = dims.containerBottom - sidebarBottom; 
            affixType = 'CONTAINER-BOTTOM';    

          } else if( sidebarBottom + dims.translateY <= colliderBottom ){
            dims.translateY = colliderBottom - sidebarBottom;
            affixType = 'VIEWPORT-BOTTOM';
          
          } else if( dims.containerTop + dims.translateY <= colliderTop ){
            affixType = 'VIEWPORT-UNBOTTOM';
          }
        }
      }

      // Make sure the translate Y is not bigger than container height.
      dims.translateY = Math.max(0, dims.translateY);
      dims.translateY = Math.min(dims.containerHeight, dims.translateY);

      dims.lastViewportTop = dims.viewportTop;
      return affixType;
    }

    /**
     * Gets inline style of sticky sidebar wrapper and inner wrapper according 
     * to its affix type.
     * @private
     * @param {String} affixType - Affix type of sticky sidebar.
     * @return {Object}
     */
    _getStyle(affixType){
      if( 'undefined' === typeof affixType ) return;

      var style = {inner: {}, outer: {}};
      var dims = this.dimensions;

      switch( affixType ){
        case 'VIEWPORT-TOP':
          style.inner = {position: 'fixed', top: this.options.topSpacing,
                left: dims.sidebarLeft - dims.viewportLeft, width: dims.sidebarWidth};
          break;
        case 'VIEWPORT-BOTTOM':
          style.inner = {position: 'fixed', top: 'auto', left: dims.sidebarLeft,
                bottom: this.options.bottomSpacing, width: dims.sidebarWidth};
          break;
        case 'CONTAINER-BOTTOM':
        case 'VIEWPORT-UNBOTTOM':
          style.inner = {position: 'absolute', top: dims.containerTop + dims.translateY};
          
          if( this.support.transform3d )
            style.inner = {transform: 'translate3d(0, '+ dims.translateY +'px, 0)'};

          else if ( this.support.transform )
            style.inner = {transform: 'translate(0, '+ dims.translateY +'px)'};
          break;
      }
      
      switch( affixType ){
        case 'VIEWPORT-TOP':
        case 'VIEWPORT-BOTTOM':
        case 'VIEWPORT-UNBOTTOM':
        case 'CONTAINER-BOTTOM':
          style.outer = {height: dims.sidebarHeight, position: 'relative'};
          break;
      }

      style.outer = StickySidebar.extend({height: '', position: ''}, style.outer);
      style.inner = StickySidebar.extend({position: 'relative', top: '', left: '',
          bottom: '', width: '',  transform: 'translate(0, 0)'}, style.inner);

      return style;
    }
   
    /**
     * Cause the sidebar to be sticky according to affix type by adding inline
     * style, adding helper class and trigger events.
     * @function
     * @protected
     * @param {string} force - Update sticky sidebar position by force.
     */
    stickyPosition(force){
      if( this._breakpoint ) return;

      force = force || false;
      
      var offsetTop = this.options.topSpacing;
      var offsetBottom = this.options.bottomSpacing;

      var affixType = this.getAffixType();
      var style = this._getStyle(affixType);
      
      if( (this.affixedType != affixType || force) && affixType ){
        let affixEvent = 'affix.' + affixType.replace('viewport-', '') + EVENT_KEY;
        StickySidebar.eventTrigger(this.sidebar, affixEvent);

        if( 'static' === affixType )
          this.sidebar.classList.remove(this.options.stickyClass);
        else
          this.sidebar.classList.add(this.options.stickyClass);
        
        for( key in style.outer ){
          let _unit = ('number' === typeof style.outer[key]) ? 'px' : '';
          this.sidebar.style[key] = style.outer[key];
        }

        for( key in style.inner ){
          let _unit = ('number' === typeof style.inner[key]) ? 'px' : _unit;
          this.sidebarInner.style[key] = style.inner[key] + _unit;
        }

        let affixedEvent = 'affixed.'+ affixType.replace('viewport', '') + EVENT_KEY;
        StickySidebar.eventTrigger(this.sidebar, affixedEvent);
      } else {
        if( this._initialized ) this.sidebarInner.style.left = style.inner.left;
      }

      this.affixedType = affixType;
    }

    /**
     * Breakdown sticky sidebar when window width is below `options.minWidth` value.
     * @protected
     */
    _widthBreakpoint(){

      if( window.innerWidth <= this.options.minWidth ){
        this._breakpoint = true;
        this.affixedType = 'STATIC';

        this.sidebar.removeAttribute('style');
        this.sidebar.classList.remove(this.options.stickyClass);
        this.sidebarInner.removeAttribute('style');
      } else {
        this._breakpoint = false;
      }
    }

    /**
     * Force re-calculate dimesnstions of sticky sidebar, container and screen viewport.
     * @public
     */
    updateSticky(){
      this.calcDimensions();
      this.stickyPosition(true);
    }

    /**
     * Set browser support features to the public property.
     * @private
     */
    _setSupportFeatures(){
      var support = this.support;

      support.transform = StickySidebar.supportTransform();
      support.transform3d = StickySidebar.supportTransform(true);
    }

    /**
     * Add resize sensor listener to specifc element.
     * @public
     * @param {DOMElement} element - 
     * @param {Function} callback - 
     */
    addResizerListener(element, callback){
      if( ! element.resizeListeners ){
        element.resizeListeners = [];
        this._appendResizeSensor(element);
      }
        
      element.resizeListeners.push(callback);
    }

    /**
     * Remove resize sonser listener from specific element.
     * @function
     * @public
     * @param {DOMElement} element - 
     * @param {Function} callback - 
     */
    removeResizeListener(element, callback){
      var resizeListeners = element.resizeListeners;
      var index = resizeListeners.indexOf(callback);

      this._resizeListeners.splice(index, 1);

      if( null !== element.resizeListeners){
        var resizeTrigger = element.resizeTrigger;
        var _window = resizeTrigger.contentDocument.defaultView;

        _window.removeEventListener('resize', this._resizeListener);
        resizeTrigger = element.querySelector(resizeTrigger).remove();
      }
    }

    /**
     * Append resize sensor object on DOM in specific element.
     * @private
     * @param {DOMElement} element - 
     */
    _appendResizeSensor(element){
      element.style.position = 'relative';

      var wrapper = document.createElement('object');
      var style = 'display: block; position: absolute; top: 0; left: 0; height: 100%; width: 100%;' + 
          'overflow: hidden; pointer-events: none; z-index: -1;';

      wrapper.setAttribute('style', style);
      wrapper.resizeElement = element;

      wrapper.addEventListener('load', (event) => {
        this.contentDocument.defaultView.resizeTrigger = this.resizeElement;
        this.contentDocument.defaultView.addEventListener('resize', this._resizeListener);
      });

      wrapper.type = 'text/html';

      if( StickySidebar.isIE() ) wrapper.data = 'about:blank';
      
      element.resizeTrigger = wrapper;
      element.appendChild(wrapper);
    }

    /**
     * Resize sensor listener to call callbacks of trigger.
     * @private 
     * @param {Object} event - Event object passed from listener.
     */
    _resizeListener(event){
      var _window = event.target || event.srcElement;
      var trigger = _window.resizeTrigger;
        
      trigger.resizeListeners.forEach((callback) => {
        callback.call(trigger, event);
      });
    }

    /**
     * Destroy sticky sidebar plugin.
     * @public
     */
    destroy(){
      window.removeEventListener('resize', this._onResize);
      window.removeEventListener('scroll', this._onScroll);

      this.sidebar.classList.remove(this.options.stickyClass);
      this.sidebar.style.minHeight = '';

      this.removeEventListener('update' + EVENT_KEY, this.updateSticky);

      var styleReset = {position: '', top: '', left: '', bottom: '', width: '',  transform: ''};
      for( key in styleReset )
        this.sidebar.style[key] = styleReset[key];

      if( this.options.resizeSensor ){
        this.removeResizeListener(this.sidebarInner, this.updateSticky);
        this.removeResizeListener(this.container, this.updateSticky);
      }
    }

    /**
     * Detarmine if the browser is Internet Explorer.
     * @function
     * @static
     */
    static isIE(){
      return Boolean(navigator.userAgent.match(/Trident/));
    }

    /**
     * Detarmine if the browser supports CSS transfrom feature.
     * @function
     * @static
     * @param {Boolean} transform3d - Detect transform with translate3d.
     * @return {String}
     */
    static supportTransform(transform3d){
      var result = false,
          property = (transform3d) ? 'perspective' : 'transform',
          upper = property.charAt(0).toUpperCase() + property.slice(1),
          prefixes = ['Webkit', 'Moz', 'O', 'ms'],
          support = document.createElement('support'),
          style = support.style;

      (property + ' ' + prefixes.join(upper + ' ') + upper).split(' ').forEach(function(property, i) {
        if (style[property] !== undefined) {
          result = property;
          return false;
        }
      });
      return result;
    }

    /**
     * Trigger custom event.
     * @static
     * @param {DOMObject} element - Target element on the DOM.
     * @param {String} eventName - Event name.
     * @param {Object} data - 
     */
    static eventTrigger(element, eventName, data){
      data = ( 'object' === typeof data ) ? data : {};

      if (window.CustomEvent) {
        var event = new CustomEvent(eventName, {detail: data});
      } else {
        var event = document.createEvent('CustomEvent');
        event.initCustomEvent(eventName, true, true, data);
      }
      element.dispatchEvent(event);
    }

    /**
     * Extend options object with defaults.
     * @function
     * @static
     */
    static extend(defaults, options){
      var results = {};
      for( let key in defaults ){
        if( 'undefined' !== typeof options[key] ) results[key] = options[key];
        else results[key] = defaults[key];
      }
      return results;
    }
  }

  // Global
  // -------------------------
  window.StickySidebar = StickySidebar;

  return StickySidebar;
})();