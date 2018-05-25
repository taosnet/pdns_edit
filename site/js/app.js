/* Initial setup of page */
var Views = {};
Handlebars.registerHelper('buttons', function(record) {
	if(record.type === 'SOA') {
		return '';
	}
	if(record.type === 'NS' || record.type === 'MX') {
		return new Handlebars.SafeString('<button class="revert">Revert</button><button class="edit">Save</button><button class="add">+</button>');
	}
	return new Handlebars.SafeString('<button class="revert">Revert</button><button class="edit">Save</button><button class="add">+</button><button class="delete">X</button>');
});
function loadView(name) {
	$.ajax({
		type: 'GET',
		url: 'views/'+name+'.html',
		success: function(data) {
			Views[name] = Handlebars.compile(data);
		},
		error: function(xhr, errorType, error) {
			throw error;
		}
	});
}
try {
	loadView('master');
	loadView('slave');
	loadView('zone');
} catch(exception) {
	$("#body").empty().append("<div class=\"error\">Error: Failed to load display structure!</div>");
}
// Validate content for a 'content' object
const contentValidator = function() {
	return this.record.validate(this.container.text());
};
// Check and register if a 'content' object's value has changed.
const contentChange = function() {
	if(this.container.text() !== 'DELETE') {
		this.container.text(this.record.sanitize(this.container.text()));
		if(!this.validate()) {
			alert(this.record.errorMessage);
			this.container.text(this.original);
			this.record.buttons.hide();
			this.container.removeClass('changed');
			return false;
		}
	}
	if(this.container.text() != this.original) {
		this.record.buttons.show();
		this.container.addClass('changed');
		this.content = this.container.text();
		return true;
	}
	this.record.buttons.hide();
	this.container.removeClass('changed');
	return false;
};
function configureRecord(record, content, li)
{
	content.container = li;
	content.record = record;
	content.original = content.content;
	content.validate = contentValidator;
	content.change = contentChange;
	li.on({
		keydown: function(theEvent) {
			if(theEvent.which === 27) { // ESC
				document.execCommand('undo');
				return false;
			} else if(theEvent.which === 13) { // New line
				content.change();
				return false;
			}
			return true;
		},
		focusout: function() { content.change(); return true; }
	});
}
const displayRecords = {
	Slave: function (zone, recordsData) {
		var records = $(Views.slave({ rrsets: recordsData }));
		zone.node.append(records);
		zone.node.children().one('click', function() {
			zone.node.children('.recordsListing').remove();
			zone.node.children().one('click', function() {
				$('.recordsListing').remove();
				zone.records(function(recordsData) {
					displayRecords[zone.kind](zone, recordsData);
				});
			});
		});
		records.find('button').on('click', function() {
			zone.retrieve(function(data) {
				alert(data.result);
				$('.recordsListing').remove();
				zone.records(function(recordsData) {
					displayRecords[zone.kind](zone, recordsData);
				});
			});
		});
	},
	Master: function (zone, recordsData) {
		var records = $(Views.master({ name: zone.name, rrsets: recordsData }));
		zone.node.append(records);
		zone.node.children('.zoneContainer').one('click', function() {
			zone.node.children('.recordsListing').remove();
			zone.node.children().one('click', function() {
				$('.recordsListing').remove();
				zone.records(function(recordsData) {
					displayRecords[zone.kind](zone, recordsData);
				});
			});
		});
		records.find('.record').each(function(index) {
			var record = zone.rrsets[index];
			record.row = $(this);
			record.buttons = $(this).find('.revert, .edit');
			record.buttons.hide();
			$(this).find('.content').children().attr('contenteditable', true).each(function(r) {
				configureRecord(record, record.records[r], $(this));
			});
			$(this).find('.revert').on('click', function() {
				record.row.find('.content li').each(function(r) {
					record.records[r].container.text(record.records[r].original);
					record.records[r].change();
				});
			});
			$(this).find('.edit').on('click', function() {
				var entries = record.records.filter(function(e) { return e.content != 'DELETE'; });
				if(entries.length === 0) {
					alert('Cannot delete the last record using this method. Please use the "X" button to delete this entry!');
					return;
				}
				record.records = entries;
				record.edit(function(data) {
					$('.recordsListing').remove();
					zone.records(function(rData) {
						displayRecords[zone.kind](zone, rData);
					});
				});
			});
			$(this).find('.add').on('click', function() {
				var newContent = record.add();
				var li = $('<li>'+newContent.content+'</li>').attr('contenteditable', true);
				record.row.find('.content').append(li);
				configureRecord(record, newContent, li);
			});
			$(this).find('.delete').on('click', function() {
				record.delete(function(data) {
					$('.recordsListing').remove();
					zone.records(function(rData) {
						displayRecords[zone.kind](zone, rData);
					});
				});
			});
		});
		records.find('.addRecord').each(function(index) {
			var row = $(this);
			var typeDefaults = {
				A: '192.168.0.1',
				CNAME: zone.name,
				MX: '10 mail.'+zone.name,
				NS: 'ns1.newmex.com.',
				TXT: 'Some arbitrary text',
				CAA: '0 issue "letsencrypt.org"'
			};
			var name = row.children().first().attr('contenteditable', true).data('default', 'test.'+zone.name).data('name', 'name');
			var ttl = name.next().attr('contenteditable', true).data('default', '3600').data('name', 'ttl');
			var type = ttl.next().children().data('default', 'A').data('name', 'type');
			var content = $(this).find('.content');
			var li = content.children().attr('contenteditable', true);
			var record = zone.newRecord();
			record.row = row;
			record.buttons = row.find('.revert');
			record.records[0].content = typeDefaults[type.val()];
			li.text(typeDefaults[type.val()]);
			configureRecord(record, record.records[0], li);
			row.find('.add').on('click', function() {
				var newRecord = record.add();
				var li = $('<li>'+typeDefaults[type.val()]+'</li>').attr('contenteditable', true);
				newRecord.content = typeDefaults[type.val()];
				content.append(li);
				configureRecord(record, newRecord, li);
				
			});
			var focusout = function(item, validate) {
				return function() {
					var text = item.text();
					if(!validate()) {
						alert('New record\'s '+item.data('name')+' must be a valid sub-domain!');
						item.text(item.data('default'));
					} else {
						record[item.data('name')] = text;
					}
				};
			};
			var focusoutName = focusout(name, function() { return name.text().isDomain(); });
			var focusoutTTL = focusout(ttl, function() { return /^[1-9]\d*$/.test(ttl.text()); });
			var keydown = function(item, validate) {
				return function(theEvent) {
					if(theEvent.which === 27) { // ESC
						document.execCommand('undo');
						return false;
					} else if(theEvent.which === 13) { // New line
						validate();
						return false;
					}
					return true;
				};
			};
			var keydownName = keydown(name, focusoutName);
			var keydownTTL = keydown(ttl, focusoutTTL);
			name.on({
				keydown: keydownName,
				focusout: focusoutName
			});
			ttl.on({
				keydown: keydownTTL,
				focusout: focusoutTTL
			});
			type.on('change', function() {
				row.find('.content li').text(typeDefaults[type.val()]);
				record.records.forEach(function(e) { e.content = typeDefaults[type.val()]; e.original = typeDefaults[type.val()]; });
				record.changeType(type.val());
			});
			row.find('.edit').on('click', function() {
				var entries = record.records.filter(function(e) { return e.content != 'DELETE'; });
				if(entries.length === 0) {
					alert('Cannot add an empty entry!');
					return;
				}
				record.records = entries;
				record.edit(function(data) {
					$('.recordsListing').remove();
					zone.records(function(rData) {
						displayRecords[zone.kind](zone, rData);
					});
				});
			});
		});
	}
};
function displayZones(zonesData)
{
	var listing = $(Views.zone({ zones: zonesData }));
	$('#zones').remove();
	$('body').append(listing);
	listing.find('.zoneListing').each(function(index) {
		var zoneEntry = Object.create(zonesData[index]);
		zoneEntry.node = $(this);
		$(this).children().one('click', function() {
			$('.recordsListing').remove();
			zoneEntry.records(function(recordsData) {
				displayRecords[zoneEntry.kind](zoneEntry, recordsData);
			});
		});
	});
}
PDNS(function(servers, error) {
	if(!servers) {
		$("#body").empty().append("<div class=\"error\">Error: Failed to connect to server!</div>");
		return;
	}
	var server = servers[0];
	$("header").append('<h2>Server: '+server.id+' ('+server.version+') '+server.type+'</h2>');
	var newZone = $('#newZone');
	var name = TaosNet.InputField('domain', newZone.find('input[name="name"]'));
	var nameservers = TaosNet.InputField('domain', newZone.find('textarea[name="nameservers"]'));
	var newZoneForm = TaosNet.form(function(data) {
		if(data) {
			if(data.kind === 'Master') {
				data.rrsets = [
					{
						name: data.name,
						type: 'A',
						ttl: 3600,
						records: [{ content: data.ip, disabled: false }]
					}
				];
			} else {
				delete data["nameservers"];
			}
			server.newZone(data, function(result) {
				alert('New zone added '+result.id+'!');
				newZoneForm.elements().map(e => e.removeClass('valid'));
			});
		} else {
			alert('Errors submitting zone creation!');
		}
		return false;
	}, newZone.find('input[type="submit"]'));
	newZoneForm.attach(newZone.find('input[name="name"]'));
	newZoneForm.attach(newZone.find('input[name="ip"]'), {
		validate: function() { return newZoneForm.value('kind') === 'Slave' || this.value().isIPv4(); },
		require: true
	});
	newZoneForm.attach(newZone.find('select[name="kind"]'), {
		validate: function() { return this.value() === 'Master' || this.value() === 'Slave'; }
	});
	newZoneForm.attach(newZone.find('input[name="masters"]'), {
		validate: function() { return newZoneForm.value('kind') === 'Master' || this.value().isIPv4(); },
		require: true,
	});
	newZoneForm.attach(newZone.find('textarea[name="nameservers"]'));
	$('#loadZones').on('click', function() {
		server.zones(displayZones);
	});
});
