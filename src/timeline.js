(function(){
   var BLOCK_HEIGHT = 14; //высота блока
   var V_MARGIN = 2;      //расстояние между блоками по вертикали
   var AXE_HEIGHT = 20;   //высота нижней линейки

   var TOOLTIP_CLOSE_DELAY = 100;
   var TOOLTIP_SHOW_DELAY  = 500;


   /**
    * Тултип отображает более подробную информацию о блоке
    * @constructor
    */
   var Tooltip = function(){
      var self = this;

      this.mousePosition = {};
      this.container = $('<div class="block-tooltip"></div>');
      this.hideTimer = null;
      this.showTimer = null;


      $(document).bind('mousemove', function(event){
         self.mousePosition = {
            x : event.pageX,
            y : event.pageY
         }
      });

      this.container.on('mouseout mouseover', function(event){
         clearTimeout(self.hideTimer);
         clearTimeout(self.showTimer);
         if (event.type == 'mouseout'){
            self.hide();
         }
      });

      $('body').append(this.container);
   };

   Tooltip.prototype.show = function(data){
      var self = this;

      clearTimeout(this.showTimer);

      this.showTimer = setTimeout(function(){

         clearTimeout(self.hideTimer);
         self.container.html(data);

         var
            direction = (self.mousePosition.x + self.container.width()) > $(window).width() ? 'left' : 'right',
            offset = {
               left : self.mousePosition.x - (direction == 'left' ? this.container.width() : 10),
               top : self.mousePosition.y - self.container.height()
            };

         self.container.show();
         self.container.offset(offset);
      }, TOOLTIP_SHOW_DELAY);


   };

   Tooltip.prototype.hide = function (){
      var self = this;
      clearTimeout(this.hideTimer);
      clearTimeout(self.showTimer);
      this.hideTimer = setTimeout(function(){
         self.container.hide();
      }, TOOLTIP_CLOSE_DELAY);
   };


   /**
    * График
    * @param {jQuery} container jQuery элемент
    * @param {Array} data массив данных
    * @constructor
    */
   var Graph = function(container, data){

      this.tip = new Tooltip();
      this._prepareContainer(container);
      this._prepareData(data || []);

      this.redraw();

      this._prepareScale();
      this._drawAxe();
      this._drawLines();
      this._initDrag();
   };

   Graph.prototype._prepareScale = function(){
      var w = this._container.width() > this._canvas.width() ? this._container.width() : this._canvas.width();

      this._scale = d3.scale.linear()
         .domain([0, w*10])
         .range([0, w]);
   };

   /**
    * Инициализируем "таскалку"
    * @private
    */
   Graph.prototype._initDrag = function(){
      function getEventOffset(e){
         return {
            x : e.pageX,
            y : e.pageY
         }
      }

      var
         self = this,
         offset,
         buttonPressed = false;

      this._wrapper.bind('mousedown mouseup mouseout', function(event){
         buttonPressed = event.type == 'mousedown';
         $(this).toggleClass('timeline__btn-pressed', buttonPressed);
         if (buttonPressed){
            offset = getEventOffset(event);
         }
      });

      $(document).bind('mousemove', function(event){
         if (buttonPressed){
            self._wrapper.scrollTop(self._wrapper.scrollTop() + offset.y - event.pageY);
            self._leftside.scrollTop(self._wrapper.scrollTop() + offset.y - event.pageY);
            self._wrapper.scrollLeft(self._wrapper.scrollLeft() + offset.x - event.pageX);
            offset = getEventOffset(event);

            self._axe.css('bottom', 0 - self._wrapper.scrollTop());
            self._lines.css('top', self._wrapper.scrollTop());
         }
      });

      this._leftside.bind('scroll', function(){
         if (!buttonPressed) {
            self._wrapper.scrollTop(self._leftside.scrollTop());
            self._axe.css('bottom', 0 - self._wrapper.scrollTop());
            self._lines.css('top', self._wrapper.scrollTop());
         }
      })
   };

   /**
    * Готовим все необходимые элементы верстки
    * @param elem
    * @private
    */
   Graph.prototype._prepareContainer = function(elem){
      this._container = elem;
      this._container.addClass('timeline__container');

      this._container.html(
        '<div class="timeline__leftside">\
            <svg class="timeline__left-canvas"></svg>\
         </div>\
         <div class="timeline__wrapper">\
            <svg class="timeline__lines"></svg>\
            <svg class="timeline__canvas"></svg>\
            <svg class="timeline__axe"></svg>\
         </div>'
      );

      this._leftside = this._container.find('.timeline__leftside');
      this._leftCanvas = this._container.find('.timeline__left-canvas');
      this._wrapper = this._container.find('.timeline__wrapper');
      this._lines = this._container.find('.timeline__lines');
      this._canvas = this._container.find('.timeline__canvas');
      this._axe = this._container.find('.timeline__axe');
   };

   /**
    * Подготавливаем данные для дальнейшей работы
    * @param data
    * @private
    */
   Graph.prototype._prepareData = function(data){

      function buildTree(data){
         var tree = {};
         data.forEach(function(elem, i){
            elem.isClosed = true;
            tree[elem.id] = {
               index : i,
               children: []
            };
            if (elem.parent !== null && tree[elem.parent]){
               tree[elem.parent].children.push(elem.id);
            }
         });
         return tree;
      }

      function collectChildren(pushTo, children, tree, lvl){
         if (children instanceof Array && children.length){
            children.forEach(function(id){
               var b = data[tree[id].index];
               b.level = lvl + 1;
               pushTo.push(b);
               collectChildren(pushTo, tree[id].children, tree, b.level);
            })
         }
      }


      data = data.sort(function(a,b){
         return a.start - b.start;
      });

      var
         b,
         newData = [],
         tree = buildTree(data),
         sortedTree = [];

      for (var i in tree){
         if (tree.hasOwnProperty(i)) {
            sortedTree[tree[i].index] = tree[i];
         }
      }

      sortedTree.forEach(function(elem){
         if (data[elem.index].parent == null){
            b = data[elem.index];
            b.level = 0;
            newData.push(b);
            collectChildren(newData, elem.children, tree, b.level);
         }
      });

      this.data = newData;
      this.tree = buildTree(this.data);
   };

   /**
    * Отрисовываем график или обновляем если уже нарисован
    */
   Graph.prototype.redraw = function(){

      this._drawBlocks();
      this._drawCaptions();

      this._drawTime();
      this._drawTitle();
      this._drawTitleTree();
      this._drawCircles();

   };

   Graph.prototype._drawTime = function(){
      var
         prevStart = 0,
         y = 0,
         self = this,
         captions = d3.select(this._leftCanvas[0]).selectAll('.time')
            .data(this.data);

      captions
         .enter()
         .append('text')
         .attr('class', 'time')
         .attr('x', function(d, i){
            return 1;
         });

      captions
         .attr('y', function(d, i){
            var res = y;
            y += self._blockIsVisible(d) ? BLOCK_HEIGHT + V_MARGIN : 0;
            return res + 11;
         })
         .text(function(d){
            var
               showTime = prevStart == 0 || d.start - prevStart > 30000,
               txt = parseInt(d.start/60000) + 'm' + parseInt((d.start%60000)/1000) + 's';

            prevStart = d.start;

            return self._blockIsVisible(d) && showTime ? txt : '';
         });
   };

   Graph.prototype._drawCaptions = function(){
      var
         y = 0,
         self = this,
         captions = d3.select(this._canvas[0]).selectAll('.block-duration')
            .data(this.data);

      //enter
      captions
         .enter()
         .append('text')
         .attr('class', 'block-duration')
         .attr('x', function(d, i){
            return d.start/10 + 2;
         })
         .on('mouseover', function(d){
            self.showTip(d)
         })
         .on('mouseout', function(d){
            self.closeTip(d);
         })
         .on('click', function(d){
            self.toggleBranch(d.id);
         });

      //update
      captions
         .attr('y', function(d, i){
            var res = y;
            y += self._blockIsVisible(d) ? BLOCK_HEIGHT + V_MARGIN : 0;
            return res + 11;
         })
         .text(function(d){
            return self._blockIsVisible(d) ? d.end- d.start + 'ms' : '';
         });
   };

   /**
    * Отрисовываем линейку
    * @private
    */
   Graph.prototype._drawAxe = function(){
      var
         svg = d3.select(this._axe[0]),
         w = this._container.width() > this._canvas.width() ? this._container.width() : this._canvas.width();

      svg
         .attr('width', w)
         .attr('height', AXE_HEIGHT);

      svg.append('g')
         .call(d3.svg.axis()
            .scale(this._scale)
            .orient("bottom")
            .ticks(parseInt(w/100)));
   };

   /**
    * Рисуем линии и область заргузки страницы
    * @private
    */
   Graph.prototype._drawLines = function(){
      var
         height = this._container.height() - AXE_HEIGHT,
         svg = d3.select(this._lines[0]),
         w = this._container.width() > this._canvas.width() ? this._container.width() : this._canvas.width();

      svg
         .attr('width', w)
         .attr('height', height);

      if (this._pageLoad) {
         d3.select(this._lines[0])
            .append('rect')
            .attr('class', 'load-page')
            .attr('x', 0)
            .attr('y', 0)
            .attr('height', height)
            .attr('width', 0)
            .transition()
            .attr('width', this._pageLoad/10)
            .duration(1000)
      }

      d3.select(this._lines[0]).selectAll('line')
         .data(this._scale.ticks(parseInt(w/100)))
         .enter()
         .append('line')
         .attr('x1', function(d){
            return d/10;
         })
         .attr('x2', function(d){
            return d/10;
         })
         .attr('y1', 0)
         .attr('y2', height);
   };

   /**
    * Показать тултип с данными блока
    * @param d
    */
   Graph.prototype.showTip = function(d){
      var
         dataStr = '',
         data = [
            d.label,
               'Старт: ' + d.start + 'ms',
               'Завершение: ' + d.end + 'ms',
               'Время выполнения: ' + (d.end- d.start) + 'ms'
         ];

      data.forEach(function(s){
         dataStr += '<div class="block-tooltip__str">' + s + '</div>'
      });

      this.tip.show(dataStr);
   };

   /**
    * Скрывает подсказку
    * @param d
    */
   Graph.prototype.closeTip = function(d){
      this.tip.hide();
   };

   /**
    * Рисует блоки
    * @private
    */
   Graph.prototype._drawBlocks = function(){
      var
         self = this,
         svgWidth = 0,
         svgHeight = 0,
         blocks = d3.select(this._canvas[0]).selectAll('rect')
            .data(this.data);

      this._maxWidth = 0;
      this._pageLoad = 0;

      //enter
      blocks
         .enter()
         .append("rect")
         .attr('class', function(d, i){
            var
               cls = '',
               css = 'block';

            if (d.parent){
               cls = self.data[self.tree[d.parent].index].cls;
            }
            else if (self.tree[d.id].children && self.tree[d.id].children.length){
               cls = 'color-' + i%6;
            }
            d.cls = cls;

            return css + ' ' + cls;
         })
         .attr('data-id', function(d){
            return d.id;
         })
         .attr('x', function(d, i){
            if (/^loadPage/.test(d.label) && d.end > self._pageLoad){
               self._pageLoad = d.end;
            }

            return d.start/10;
         })
         .attr('width', function(d){
            var w = (d.end - d.start)/10;

            if (d.end/10 > self._maxWidth) {
               self._maxWidth = d.end/10;
            }

            return  w < 1 ? 1 : w;
         })
         .on('mouseover', function(d){
            self.showTip(d)
         })
         .on('mouseout', function(d){
            self.closeTip(d);
         })
         .on('click', function(d){
            self.toggleBranch(d.id);
         });

      //update
      blocks
         .attr('y', function(d){
            var y = svgHeight;
            svgHeight += self._blockIsVisible(d) ? BLOCK_HEIGHT + V_MARGIN : 0;
            d.y = y;
            return y;
         })
         .attr('height', function(d){
            return self._blockIsVisible(d) ? BLOCK_HEIGHT : 0;
         })
         .each(function(d){
            if (self._blockIsVisible(d) && d.end/10 > svgWidth){
               svgWidth = d.end/10;
            }
         });

      d3.select(this._canvas[0])
         .attr('height', svgHeight + BLOCK_HEIGHT + V_MARGIN)
         .attr('width', svgWidth);
   };

   /**
    * Рисует кнопки переключающие выдимость содержимого блока
    * @private
    */
   Graph.prototype._drawCircles = function(){
      var
         y = 0,
         self = this,
         circles = d3.select(this._leftCanvas[0]).selectAll('circle')
            .data(this.data);

      //enter
      circles
         .enter()
         .append('circle')
         .filter(function(d){
            return self.tree[d.id].children && self.tree[d.id].children.length;
         })
         .attr('cx', function(d, i){
            return 40 + d.level*10;
         })
         .on('click', function(d){
            self.toggleBranch(d.id);
         });

      //update
      circles
         .attr('r', function(d){
            return self._blockIsVisible(d) && self.tree[d.id].children.length ? 4 : 0;
         })
         .attr('cy', function(d, i){
            var res = y;
            y += self._blockIsVisible(d) ? BLOCK_HEIGHT + V_MARGIN : 0;
            return res + BLOCK_HEIGHT/2;
         })
         .attr('class', function(d){
            return 'toggle-branch toggle-branch__' + (d.isClosed ? 'closed' : 'opened') + ' ' + d.cls;
         })
   };

   /**
    * Рисуем радписи на блоках
    * @private
    */
   Graph.prototype._drawTitle = function(){
      var
         y = 0,
         self = this,
         captions = d3.select(this._leftCanvas[0]).selectAll('.block-caption')
            .data(this.data);

      function getBlockElem(id){
         return self._canvas[0].querySelector('[data-id="'+ id +'"]');
      }

      function toggleHover(id, action){
         var elem = getBlockElem(id);

         elem.classList[action ? 'add' : 'remove']('hover');
      }

      captions
         .enter()
         .append('text')
         .attr('class', 'block-caption')
         .attr('x', function(d, i){
            return 47 + d.level*10;
         })
         .on('mouseover', function(d){
            toggleHover(d.id, true);
         })
         .on('mouseout', function(d){
            toggleHover(d.id, false);
         })
         .on('click', function(d){
            var
               elem = getBlockElem(d.id),
               x = parseInt(elem.getAttribute('x'),10),
               wrapperWidth = self._wrapper.width(),
               scrollLeft = x - wrapperWidth/2,
               needToScroll = Math.abs(x - self._wrapper.scrollLeft()) > wrapperWidth;

            if (needToScroll){
               self._wrapper.animate({'scrollLeft': scrollLeft}, 'slow');
            }
            else{
               self.toggleBranch(d.id);
            }
         });

      captions
         .attr('y', function(d, i){
            var res = y;
            y += self._blockIsVisible(d) ? BLOCK_HEIGHT + V_MARGIN : 0;
            return res + 11;
         })
         .text(function(d){
            return self._blockIsVisible(d) ? d.label : '';
         });

      d3.select(this._leftCanvas[0])
         .attr('height', y + BLOCK_HEIGHT + V_MARGIN)
         .attr('width', 300);
   };

   Graph.prototype._drawTitleTree = function(){
      var
         y = 0,
         self = this,
         captions = d3.select(this._leftCanvas[0]).selectAll('.title-tree')
            .data(this.data);

      captions
         .enter()
         .append('path')
         .attr('class', function(d){
            return 'title-tree' + ' ' + d.cls;
         });


      captions
         .attr('d', function(d, i){
            var
               result = undefined,
               y1 = y,
               x1 = 40 + d.level*10,
               x2 = x1 - 10,
               y2 = d.parent ? self.data[self.tree[d.parent].index].y + 14: 0;

            y += self._blockIsVisible(d) ? BLOCK_HEIGHT + V_MARGIN : 0;

            y1+=7;


            if (self._blockIsVisible(d) && d.level){
               result = 'M' + x1 + ' ' + y1 + ' H' + x2 + ' V' + y2;
            }
            return result;
         });
   };

   /**
    * Закрывает блок с указанным идентификатором
    * @param id
    * @private
    */
   Graph.prototype._closeBranch = function(id){
      var
         self = this,
         block = this.data[self.tree[id].index],
         children = self.tree[id].children;

      block.isClosed = true;
      children.forEach(this._closeBranch.bind(this));
   };

   /**
    * Переключает видимость содержимого блока с указанным идентификатором
    * @param id
    */
   Graph.prototype.toggleBranch = function(id){
      var
         treeInfo = this.tree[id],
         hasChildren = treeInfo.children && treeInfo.children.length,
         block = this.data[treeInfo.index];

      if (hasChildren){
         if (block.isClosed){
            block.isClosed = false;
         }
         else{
            this._closeBranch(id);
         }
         this.redraw();
      }
   };

   /**
    * Проверяет видимый ли блок
    * @param d
    * @returns {boolean}
    * @private
    */
   Graph.prototype._blockIsVisible = function(d){
      var
         parentId = d.parent,
         parentBlock = d.parent !== null ? this.data[this.tree[parentId].index] : null;
      return parentBlock ? !parentBlock.isClosed : true;
   };


   window.TimeLine = Graph;

}());
