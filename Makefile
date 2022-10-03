.PHONY: install

install:
	yarn install --immutable --immutable-cache
	yarn husky install
