/* Extend builtin Javascript Objects with useful functionality */
var TaosNet = (function() {
        Array.prototype.tags = function(tag) {
                return this.reduce(((accumulator, e) => accumulator+'<'+tag+'>'+e+'</'+tag+'>'), '');
        };
        var types = {
                'ul': function(items) { return '<ul>'+items.tags('li')+'</ul>'; },
                'tr': function(columns) { return '<tr>'+columns.tags('td')+'</tr>'; },
                'thead': function(headers) { return '<thead><tr>'+headers.tags('th')+'</tr></thead>'; },
                'select': function(options) { return '<select>'+options.reduce(((accumulator, option) => accumulator+'<option'+(value == option ? ' selected' : '')+'>'+option+'</option>'), '')+'</select>'; }
        };
        Array.prototype.htmlText = function(type) {
                return types[type](this);
        };
        Array.prototype.htmlContainer = function(type) {
                return $(types[type](this));
        };
        Array.prototype.select = function(value) {
                return $('<select>'+this.reduce(((accumulator, option) => accumulator+'<option'+(value == option ? ' selected' : '')+'>'+option+'</option>'), '')+'</select>');
        };
        Array.prototype.table = function(headers) {
                var table = $('<table></table>').append(headers.htmlContainer('thead'));
                if(this.length == 0) {
                        return table.append('<tbody></tbody>');
                }
                return table.append('<tbody>'+this.reduce(((acc, e) => acc+types['tr'](e)), '')+'</tbody>');
        };

        var domainReg = new RegExp(/^((?:(?:(?:\w[\.\-\+]?)*)\w)+)((?:(?:(?:\w[\.\-\+]?){0,62})\w)+)\.(\w{2,6})\.?$/);
        String.prototype.isDomain = function() {
                return domainReg.test(this);
        };
	Array.prototype.isDomain = function() { return this.every(e => e.isDomain()); };
        String.prototype.isIPv4 = function() {
                var parts = this.split('.');
                if(parts.length != 4) {
                        return false;
                }
		return parts.every(o => Number(o) < 256);
        };
	Array.prototype.isIPv4 = function() { return this.every(e => e.isIPv4()); };
	var intReg = new RegExp(/^[1-9]\d*$/);
	String.prototype.isInteger = function() { return intReg.test(this); };
	Array.prototype.isInteger = function() { return this.every(e => e.isInteger()); };

	const simpleSanitize = function() { return this.value(); };
	const inputTypes = {
		domain: {
			validate: function() { return this.value().isDomain(); },
			sanitize: function() {
				if(this.validate()) {
					var v = this.value();
					if(typeof v === 'object') {
						this.value(v.map(e => e.endsWith('.') ? e : e+'.'));
					} else if(!v.endsWith('.')) {
						this.value(v+'.');
					}
				}
				return this.value();
			}
		},
		ipv4: {
			validate: function() { return this.value().isIPv4(); },
			sanitize: simpleSanitize
		},
		integer: {
			validate: function() { return this.value().isInteger(); },
			sanitize: simpleSanitize
		}
	};
	const valWrapper = function(val) {
		return (val ? this.element.val(val) : this.element.val());
	};
	var tagValues = {
		INPUT: valWrapper,
		SELECT: valWrapper,
		TEXTAREA: function(val) {
			return (val ? this.element.text(val.join("\n")) : this.element.text().split("\n"));
		}
	};
	function InputField(type, element)
	{
		var field = Object.create(inputTypes[type]);
		field.element = element;
		field.value = tagValues[element.prop('tagName')];
		return field;
	}
	const allGood = function() { return true; };
	function assignMeta(meta, element, options, type)
	{
		if(type in options) {
			meta[type] = options[type];
		} else if(element.data(type)) {
			meta[type] = element.data(type);
		}
	}
	function assignProperty(meta, element, options, type)
	{
		if(type in options) {
			meta[type] = options[type];
		} else if(element.prop(type)) {
			meta[type] = true;
		} else {
			meta[type] = false;
		}
	}
	function assignOptionsOnly(meta, element, options, type)
	{
		if(type in options) {
			meta[type] = options[type];
		}
	}
	function assignElementAttr(attr)
	{
		return function(meta, element, options, type) {
			if(type in options) {
				meta[type] = options[type];
			} else if(element.attr(attr)) {
				meta[type] = element.attr(attr);
			}
		};
	}
	const optionsHandler = {
		required: assignProperty,
		value: assignOptionsOnly,
		error: assignElementAttr('title'),
		name: assignElementAttr('name'),
		type: assignMeta
	};
	var formObj = {
		attach: function(element, options) {
			var meta = {
				element: element,
				value: tagValues[element.prop('tagName')]
			};
			if(!options) {
				options = {};
			}
			[ 'name', 'required', 'value', 'error', 'type' ].forEach(function(e) {
				optionsHandler[e](meta, element, options, e);
			});
			this.data[meta.name] = meta;
			if('type' in meta) {
				if(meta.required) {
					meta.validate = inputTypes[meta.type].validate;
				} else {
					var v = inputTypes[meta.type].validate;
					meta.validate = function() {
						if(this.value()) {
							return this.value().v();
						}
						return true;
					};
				}
				meta.sanitize = inputTypes[meta.type].sanitize;
			}
			if('validate' in options) {
				if(typeof options.validate === 'string') {
					if(meta.required) {
						meta.validate = inputTypes[options.validate].validate;
					} else {
						var v = inputTypes[options.validate].validate;
						meta.validate = function() {
							if(this.value()) {
								return this.value().v();
							}
							return true;
						};
					}
				} else {
					meta.validate = options.validate;
				}
			} else if(!('validate' in meta)) {
				meta.validate = allGood;
			}
			if('sanitize' in options) {
				if(typeof options.sanitize === 'string') {
					meta.sanitize = inputTypes[options.sanitize].sanitize;
				} else {
					meta.sanitize = simpleSanitize;
				}
			} else if(!('sanitize' in meta)) {
				meta.sanitize = simpleSanitize;
			}
		},
		validate: function() {
			var errors = {};
			var form = this;
			Object.keys(this.data).forEach(function(key) {
				if(!form.data[key].validate()) {
					errors[key] = true;
					form.data[key].element.addClass('error');
					if('error' in form.data[key]) {
						form.data[key].element.attr('title', form.data[key].error);
					}
				} else {
					form.data[key].element.removeClass('error');
					form.data[key].element.addClass('valid');
				}
			});
			if(Object.keys(errors).length > 0) {
				this.errors = errors;
			} else if('errors' in this) {
				delete this['errors'];
			}
			return !('errors' in this);
		},
		values: function() {
			var form = this;
			var values = {};
			Object.keys(this.data).forEach(function(k) { values[k] = form.data[k].sanitize(); });
			return values;
		},
		value: function(field) {
			return this.data[field].value();
		},
		submit: function() {
			if(this.validate()) {
				return this.callback(this.values());
			} else {
				return this.callback(false);
			}
		},
		elements: function() {
			var form = this;
			return Object.keys(this.data).map(k => form.data[k].element);
		}
	};
	function smartForm(callback, trigger)
	{
		var form = Object.create(formObj);
		form.callback = callback;
		form.data = {};
		if(trigger) {
			trigger.each(function() {
				var e = $(this);
				if(e.prop('tagName') === 'INPUT' && e.attr('type') === 'submit') {
					e.on('click', function() {
						return form.submit();
					});
				}
			});
		}
		return form;
	}

	return {
		InputField: InputField,
		form: smartForm
	};
})();
