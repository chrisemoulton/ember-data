var get = Ember.get;
var forEach = Ember.EnumerableUtils.forEach;

/**
  The EmbeddedRecordsMixin allows you to add embedded record support to your
  serializers.
  To set up embedded records, you include the mixin into the serializer and then
  define your embedded relations.

  ```js
  App.PostSerializer = DS.ActiveModelSerializer.extend(DS.EmbeddedRecordsMixin, {
    attrs: {
      comments: {embedded: 'always'}
    }
  })
  ```

  Currently only `{embedded: 'always'}` records are supported.

  @class EmbeddedRecordsMixin
  @namespace DS
*/
DS.EmbeddedRecordsMixin = Ember.Mixin.create({

  /**
    Serialize has-may relationship when it is configured as embedded objects.

    @method serializeHasMany
  */
  serializeHasMany: function(record, json, relationship) {
    var key   = relationship.key,
        attrs = get(this, 'attrs'),
        embed = attrs && attrs[key] && attrs[key].embedded === 'always';

    if (embed) {
      json[this.keyForAttribute(key)] = get(record, key).map(function(relation) {
        var data = relation.serialize(),
            primaryKey = get(this, 'primaryKey');

        data[primaryKey] = get(relation, primaryKey);

        //TODO Igor make general
        if(data.id){
          delete data.id;
        }

        return data;
      }, this);
    }
  },

  serializeBelongsTo: function(record, json, relationship) {
     var key   = relationship.key,
         attrs = get(this, 'attrs'),
         embed = attrs && attrs[key] && attrs[key].embedded === 'always';

    if (embed) {
      var serialized = null;
      if (get(record, key)){
        serialized = get(record, key).serialize();
        //TODO Igor make general
        delete serialized.id;
      }
      json[this.keyForAttribute(key)] = serialized;

    } else{
      return this._super(record, json, relationship);
    }
  },

  /**
    Extract embedded objects out of the payload for a single object
    and add them as sideloaded objects instead.

    @method extractSingle
  */
  extractSingle: function(store, primaryType, payload, recordId, requestType) {
    var root = this.keyForAttribute(primaryType.typeKey),
        partial = payload[root];

    updatePayloadWithEmbedded(store, this, primaryType, partial, payload);

    return this._super(store, primaryType, payload, recordId, requestType);
  },

  /**
    Extract embedded objects out of a standard payload
    and add them as sideloaded objects instead.

    @method extractArray
  */
  extractArray: function(store, type, payload) {
    var root = this.keyForAttribute(type.typeKey),
        partials = payload[Ember.String.pluralize(root)];

    forEach(partials, function(partial) {
      updatePayloadWithEmbedded(store, this, type, partial, payload);
    }, this);

    return this._super(store, type, payload);
  }
});

function updatePayloadWithEmbedded(store, serializer, type, partial, payload) {
  var attrs = get(serializer, 'attrs');

  if (!attrs) {
    return;
  }

  type.eachRelationship(function(key, relationship) {
    var expandedKey, embeddedTypeKey, attribute, ids,
        config = attrs[key],
        serializer = store.serializerFor(relationship.type.typeKey),
        primaryKey = get(serializer, "primaryKey");


    if (config && (config.embedded === 'always' || config.embedded === 'load')) {
      // underscore forces the embedded records to be side loaded.
      // it is needed when main type === relationship.type
      embeddedTypeKey = '_' + serializer.typeForRoot(relationship.type.typeKey);
      expandedKey = serializer.keyForRelationship(key, relationship.kind);
      attribute  = serializer.keyForAttribute(key);
      ids = [];

      if (!partial[attribute]) {
        return;
      }

      payload[embeddedTypeKey] = payload[embeddedTypeKey] || [];
      if (relationship.kind ===  "hasMany") {
        forEach(partial[attribute], function(data) {
          var embeddedType = store.modelFor(relationship.type.typeKey);
          updatePayloadWithEmbedded(store, serializer, embeddedType, data, payload);
          var id = Ember.guidFor(data);
          data.id = id;
          ids.push(id);
          payload[embeddedTypeKey].push(data);
        });
      }else{
        var data = partial[attribute];

        var embeddedType = store.modelFor(relationship.type.typeKey);
        updatePayloadWithEmbedded(store, serializer, embeddedType, data, payload);
        var id = Ember.guidFor(data);
        data.id = id;
        ids = id;

        payload[embeddedTypeKey].push(data);
      }

      partial[expandedKey] = ids;
      delete partial[attribute];
    }
  }, serializer);
}
