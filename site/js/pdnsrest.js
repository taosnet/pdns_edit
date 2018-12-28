var PDNS = (function() {
	var servers;
	const recordTypes = [ 'A', 'AAAA', 'AFSDB', 'ALIAS', 'CAA', 'CERT', 'CDNSKEY', 'CDS', 'CNAME', 'DNSKEY', 'DNAME', 'DS', 'HINFO', 'KEY', 'LOC', 'MX', 'NAPTP', 'NSEC', 'NSEC3', 'NSEC3PARAM', 'NS', 'OPENPGPKEY', 'PTR', 'RP', 'RRSIG', 'SOA', 'SPF', 'SSHFP', 'SRV', 'TKEY', 'TSIG', 'TLSA', 'TXT', 'URI' ];
	var sendGet = function(path, callback) {
		$.ajax({
			type: "GET",
			url: "api/"+path,
			dataType: 'json',
			success: callback,
			error: function(xhr, errorType, error) {
				callback(null, error);
			}
		});
	};
	var sendAlter = function(method, path, callback, data) {
		if(data) {
			$.ajax({
				type: method,
				url: 'api/'+path,
				dataType: 'json',
				success: callback,
				data: JSON.stringify(data),
				contentType: 'application/json; charset=utf-8'
			});
		} else {
			$.ajax({
				type: method,
				url: 'api/'+path,
				dataType: 'json',
				success: callback
			});
		}
	};
	const validate = {
                name: function(txt) {
                        return (!txt.isDomain() || txt.length < this.name.length+2 || txt.substr(-this.name.length-1) != '.'+this.name);
                },
                ttl: function(txt) {
                        return /^[1-9]\d*$/.test(txt);
                },
                A: function(txt) {
                        return txt.isIPv4();
                },
                CNAME: function(txt) {
                        return txt.isDomain();
                },
                NS: function(txt) {
                        return txt.isDomain();
                },
                MX: function(txt) {
			var expression = /^\d+ (.+)\.$/;
			var match = expression.exec(txt);
			if(match && match[1]) {
				if(match[1].isDomain()) {
					return true;
				}
			}
                        return false;
                },
                TXT: function(txt) {
                        return !(/(\x00|\u0000|\n|\r)/.test(txt));
                }
        };
	const messages = {
		name: '"Name" must be valid sub-domain!',
		ttl: '"TTL" must be an integer greater than 0!',
		A: '"A" record must be a valid IPv4 Address!',
		CNAME: '"CNAME" record must be a valid domain!',
		NS: '"NS" record must be a valid domain!',
		MX: '"MX" record format is "priority domain"!',
		TXT: '"TXT" record does not currently support NULL, \n, and \r characters!'
	};
	const sanitize = {
		'*': function(txt) { return txt; },
		name: function(txt) { return txt; },
		ttl: function(txt) { return txt; },
		TXT: function(txt) {
			if(txt.substr(0, 1) === '"' && txt.substr(-1, 1) === '"') {
				return txt;
			}
			return JSON.stringify(txt);
		}
	};
	function editRecord(callback) {
		var data = {
			rrsets: [{
				name: this.name,
				type: this.type,
				ttl: this.ttl,
				changetype: 'REPLACE',
				records: this.records.map(function(e) { return { content: e.content, disabled: e.disabled }; })
			}]
		};
		sendAlter('PATCH', 'servers/'+this.server.id+'/zones/'+this.id, callback, data);
	}
	function deleteRecord(callback)
	{
		var data = {
			rrsets: [{
				name: this.name,
				type: this.type,
				ttl: this.ttl,
				changetype: 'DELETE',
				records: []
			}]
		};
		sendAlter('PATCH', 'servers/'+this.server.id+'/zones/'+this.id, callback, data);
	}
	function addRecord()
	{
		var newRecord = {
			content: 'CHANGE ME!',
			disabled: false
		};
		this.records.push(newRecord);
		return newRecord;
	}
	function zoneRecordCallbacks(record)
	{
		record.add = addRecord;
		record.validate = validate[record.type];
		record.errorMessage = messages[record.type];
		if(record.type in sanitize) {
			record.sanitize = sanitize[record.type];
		} else {
			record.sanitize = sanitize['*'];
		}
		if(record.kind === 'Master') {
			record.edit = editRecord;
			record.delete = deleteRecord;
			record.remove = deleteZone;
		}
		record.changeType = function(type) {
			record.type = type;
			zoneRecordCallbacks(record);
		};
	}
	function newZoneRecord()
	{
		var record = Object.create(this);
		record.name = 'test.'+this.name;
		record.type = "A";
		record.ttl = 3600;
		record.records = [ { content: 'CHANGE ME!', disabled: false } ];
		zoneRecordCallbacks(record);
		return record;
	}
	function getRecords(callback)
	{
		var zone = this;
		sendGet('servers/'+this.server.id+'/zones/'+this.id, function(data) {
			zone.rrsets = [];
			var records = data.rrsets.map(function(record) {
				var newRecord = Object.create(zone);
				Object.assign(newRecord, record);
				zone.rrsets.push(newRecord);
				zoneRecordCallbacks(newRecord);
				return newRecord;
			});
			callback(records);
		});
	}
	function retrieveZone(callback)
	{
		sendAlter('PUT', 'servers/'+this.server.id+'/zones/'+this.id+'/axfr-retrieve', callback);
	}
	function createZone(data, callback)
	{
		var server = this;
		var zone = {
			name: data.name,
			kind: data.kind,
			nameservers: data.nameservers
		};
		if(data.masters) {
			zone.masters = [data.masters];
		}
		if(data.rrsets) {
			zone.rrsets = data.rrsets;
		}
		sendAlter('POST', 'servers/'+this.id+'/zones', callback, zone);
	}
	function deleteZone(callback)
	{
		var zone = this;
		sendAlter('DELETE', 'servers/'+this.server.id+'/zones/'+this.id, callback);
	}
	function getZones(callback)
	{
		var server = this;
		sendGet('servers/'+this.id+'/zones', function(data) {
			var zones = data.map(function(zone) {
				zone.server = server;
				zone.records = getRecords;
				zone.newRecord = newZoneRecord;
				if(zone.kind === 'Slave') {
					zone.retrieve = retrieveZone;
				}
				return zone;
			});
			callback(zones);
		});
	}
	var constructor = function(callback) {
		if(servers) {
			callback(servers);
		} else {
			sendGet("servers", function(data, error) {
				if(!data) {
					callback(null, error);
					return;
				}
				servers = data.map(function(server) {
					server.zones = getZones;
					server.newZone = createZone;
					return server;
				});
				callback(servers);
			});
		}
	};
	return constructor;
})();
